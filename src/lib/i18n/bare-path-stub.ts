import localeManifest from "../data/locales.json" with { type: "json" };
import { SITE_NAME } from "../data/page-metadata.js";
import { LOCALE_CODES } from "../types/locale.js";
import { PARAGLIDE_OPTIONS } from "./paraglide-options.js";
import { PRERENDERED_ROUTES } from "./prerender-entries.js";

import type { LocaleCode, LocaleManifest } from "../types/locale.js";

/** The locale a visitor with no usable preference lands in; Paraglide's `baseLocale`. */
const FALLBACK_LOCALE: LocaleCode = "en";

/**
 * Every bare path with a page behind it: the root and each route's unprefixed slug. There is no
 * unprefixed default locale, so each is served a stub that picks the visitor's locale.
 */
export const BARE_PATHS: readonly `/${string}`[] = PRERENDERED_ROUTES.map(
  (route): `/${string}` => route || "/",
);

/** The static file Cloudflare Pages serves at `barePath`: `/` from `index.html`, `/x` from `x.html`. */
export function barePathStubFile(barePath: string): string {
  return barePath === "/" ? "index.html" : `${barePath.slice(1)}.html`;
}

const COOKIE_PREFIX = `${PARAGLIDE_OPTIONS.cookieName}=`;

/**
 * Picks the locale the way the server did before pages were prerendered: the stored preference
 * cookie, then the browser's languages (each full tag, then its base language, matched without
 * regard to case, as Paraglide's negotiation does), then English. It keeps the path, query, &
 * fragment, and `location.replace` keeps the stub out of the history, so Back skips it. One text
 * for every stub, so one CSP hash allows them all.
 */
export const BARE_PATH_STUB_SCRIPT = `(() => {
  const locales = ${JSON.stringify(LOCALE_CODES)};
  const toLocale = (tag) => locales.find((locale) => locale.toLowerCase() === tag.toLowerCase());
  const cookie = document.cookie.split(/;\\s*/).find((entry) => entry.startsWith(${JSON.stringify(COOKIE_PREFIX)}));
  const stored = cookie && locales.find((locale) => locale === cookie.slice(${String(COOKIE_PREFIX.length)}));
  const negotiated = (navigator.languages || [])
    .map((tag) => toLocale(tag) || toLocale(tag.split("-")[0]))
    .find(Boolean);
  const locale = stored || negotiated || ${JSON.stringify(FALLBACK_LOCALE)};
  const { hash, pathname, search } = location;
  location.replace("/" + locale + (pathname === "/" ? "" : pathname) + search + hash);
})();`;

const LOCALE_NAMES = new Map(
  (localeManifest as LocaleManifest).map((entry) => [entry.tag, entry.displayName]),
);

/**
 * The page served at `barePath`. Its script sends the visitor on to their locale's copy of the
 * page; without JavaScript, it lists every locale's copy instead.
 */
export function renderBarePathStub(barePath: string): string {
  const rest = barePath === "/" ? "" : barePath;
  const links = LOCALE_CODES.map(
    (locale) =>
      `<li><a href="/${locale}${rest}" hreflang="${locale}" lang="${locale}">${LOCALE_NAMES.get(locale) ?? locale}</a></li>`,
  );
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    `<title>${SITE_NAME}</title>`,
    `<script>${BARE_PATH_STUB_SCRIPT}</script>`,
    "</head>",
    "<body>",
    "<ul>",
    ...links,
    "</ul>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
