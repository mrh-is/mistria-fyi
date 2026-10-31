import { LOCALE_CODES } from "../types/locale.js";

/**
 * Every page route as its unprefixed path (`""` is the home page): the root layout prerenders them
 * all, and each is also a promised slug whose bare path gets a locale-picking stub
 * (`bare-path-stub.ts`). SvelteKit's default `*` entry would prerender the unprefixed paths, which
 * have no locale, so the build lists each locale's copy instead. A route missing here fails the
 * build as unseen; `prerender-entries.test.ts` checks the list against the route files.
 */
export const PRERENDERED_ROUTES = [
  "",
  "/about",
  "/almanac",
  "/animals",
  "/cosmetics",
  "/data",
  "/everything",
  "/mines",
  "/museum",
  "/privacy",
  "/quests",
  "/recipes",
  "/renown",
  "/skills",
  "/sync",
  "/villagers",
] as const;

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
