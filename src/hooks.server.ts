import { sequence } from "@sveltejs/kit/hooks";

import { BARE_PATHS, renderBarePathStub } from "#lib/i18n/bare-path-stub.js";
import { UNLOCALIZED_PATH_PREFIXES } from "#lib/i18n/paraglide-options.js";
import { getTextDirection, isLocale, locales } from "#lib/paraglide/runtime.js";
import { paraglideMiddleware } from "#lib/paraglide/server.js";
import { withSecurityHeaders } from "#lib/security/security-headers.js";

import type { Handle } from "@sveltejs/kit/hooks";

const LOCALES_BY_LOWERCASE = new Map(locales.map((locale) => [locale.toLowerCase(), locale]));

/**
 * The path with its first segment in canonical locale casing (`/zh-hans/almanac` →
 * `/zh-Hans/almanac`), or undefined if that segment isn't a miscased locale. Locale matching is
 * case-sensitive, and retyped or normalized links often lowercase it.
 */
function canonicalLocalePath(pathname: string): string | undefined {
  const [, firstSegment = "", ...rest] = pathname.split("/");
  if (isLocale(firstSegment)) return undefined;
  const locale = LOCALES_BY_LOWERCASE.get(firstSegment.toLowerCase());
  return locale === undefined ? undefined : ["", locale, ...rest].join("/");
}

function hasLocalePrefix(pathname: string): boolean {
  const firstSegment = pathname.split("/")[1];
  return isLocale(firstSegment);
}

function isUnlocalizedPath(pathname: string): boolean {
  return UNLOCALIZED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const BARE_PATH_SET: ReadonlySet<string> = new Set(BARE_PATHS);

/**
 * Production serves every bare path (e.g. `/almanac`) as a static stub that picks the locale in
 * the browser, and fixes a miscased locale prefix with `_redirects` (`src/lib/build/
 * bare-path-stubs.ts`); there, only `/api` reaches this Function. The dev server & `vite preview`
 * have neither file, so this serves the same stub and the same redirect, keeping every bare URL
 * landing on the right locale's page wherever the app runs. An unknown bare path falls through to
 * the not-found page.
 */
export const barePathStub: Handle = ({ event, resolve }) => {
  const { pathname } = event.url;

  if (isUnlocalizedPath(pathname) || hasLocalePrefix(pathname)) {
    return resolve(event);
  }

  // Locale URLs are a public contract in BCP 47 casing; other casings redirect there permanently.
  const canonicalPath = canonicalLocalePath(pathname);
  if (canonicalPath !== undefined) {
    return new Response(undefined, {
      headers: { location: `${canonicalPath}${event.url.search}` },
      status: 308,
    });
  }

  if (!BARE_PATH_SET.has(pathname)) return resolve(event);
  return new Response(renderBarePathStub(pathname), {
    headers: { "content-type": "text/html; charset=utf-8" },
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
 * passing through this hook (`/api` in production; every server response in development & preview)
 * get the security headers here. SvelteKit adds the CSP to rendered pages itself; pre-hook
 * responses, such as trailing-slash normalization redirects, do not receive these headers.
 */
export const securityHeaders: Handle = async ({ event, resolve }) =>
  withSecurityHeaders(await resolve(event));

export const handle: Handle = sequence(securityHeaders, barePathStub, paraglideHandle);
