import { sequence } from "@sveltejs/kit/hooks";

import { UNLOCALIZED_PATH_PREFIXES } from "#lib/i18n/paraglide-options.js";
import {
  baseLocale,
  cookieName,
  extractLocaleFromHeader,
  getTextDirection,
  isLocale,
} from "#lib/paraglide/runtime.js";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { withSecurityHeaders } from "#lib/security/security-headers.js";

import type { Handle } from "@sveltejs/kit/hooks";

function hasLocalePrefix(pathname: string): boolean {
  const firstSegment = pathname.split("/")[1];
  return isLocale(firstSegment);
}

function isUnlocalizedPath(pathname: string): boolean {
  return UNLOCALIZED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * There is no unprefixed default locale, so a bare path (e.g. `/almanac`) can't be rendered as
 * is. Redirect it to a resolved locale: the stored preference cookie, then `Accept-Language`
 * negotiation, then English. Clients with no usable language (link unfurlers, crawlers, speakers
 * of unsupported languages) still land on a real page rather than a dead end.
 */
export const bareLocaleRedirect: Handle = ({ event, resolve }) => {
  const { pathname } = event.url;

  if (isUnlocalizedPath(pathname) || hasLocalePrefix(pathname)) {
    return resolve(event);
  }

  const cookieLocale = event.cookies.get(cookieName);
  const preferredLocale =
    (cookieLocale && isLocale(cookieLocale) ? cookieLocale : undefined) ??
    extractLocaleFromHeader(event.request) ??
    baseLocale;

  // `event.url.search` is inaccessible while prerendering; every prerendered route is already
  // excluded above, so this only runs for on-demand SSR requests, where reading it is safe.
  const location = `/${preferredLocale}${pathname === "/" ? "" : pathname}${event.url.search}`;
  // The target depends on the cookie & `Accept-Language`, so caches must key on both.
  return new Response(undefined, {
    headers: { location, vary: "Cookie, Accept-Language" },
    status: 307,
  });
};

const paraglideHandle: Handle = ({ event, resolve }) =>
  // `event.request` is read-only in SvelteKit 3, so the middleware's de-localized request is unused;
  // routing already de-localizes through the `reroute` hook in `hooks.ts`.
  paraglideMiddleware(event.request, ({ locale }) =>
    resolve(event, {
      transformPageChunk: ({ html }) =>
        html.replace("%lang%", locale).replace("%dir%", getTextDirection(locale)),
    }),
  );

/**
 * Cloudflare Pages applies `_headers` to static files only, never to Function responses. Responses
 * passing through this hook (pages, bare-path redirects, `/api`) get the security headers here.
 * SvelteKit adds the CSP to rendered pages itself; pre-hook responses, such as trailing-slash
 * normalization redirects, do not receive these headers.
 */
export const securityHeaders: Handle = async ({ event, resolve }) =>
  withSecurityHeaders(await resolve(event));

export const handle: Handle = sequence(securityHeaders, bareLocaleRedirect, paraglideHandle);
