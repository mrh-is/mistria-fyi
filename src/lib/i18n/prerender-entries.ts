import { LOCALE_CODES } from "../types/locale.js";

/**
 * Routes whose `+page.ts` sets `prerender = true`. SvelteKit's default `*` entry would prerender
 * them at their unprefixed paths, which only redirect (there is no unprefixed default locale), so
 * the build lists each locale's copy instead. A route marked prerenderable but missing here fails
 * the build as unseen.
 */
export const PRERENDERED_ROUTES = ["/data", "/settings"] as const;

/** Prerendered paths outside the locale prefixes (see `UNLOCALIZED_PATH_PREFIXES`). */
const UNLOCALIZED_PRERENDERED_PATHS = ["/sitemap.xml"] as const;

/**
 * Every prerender entry: each prerendered route under each locale prefix, matching the
 * all-prefixed `urlPatterns` in `paraglide-options.ts` (`prerender-entries.test.ts` checks them
 * against Paraglide's own `localizeHref`), plus the unlocalized prerendered files.
 */
export const PRERENDER_ENTRIES: `/${string}`[] = [
  ...LOCALE_CODES.flatMap((locale) =>
    PRERENDERED_ROUTES.map((route): `/${string}` => `/${locale}${route}`),
  ),
  ...UNLOCALIZED_PRERENDERED_PATHS,
];
