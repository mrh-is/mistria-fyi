import { LOCALE_CODES } from "../types/locale.js";

import type { CompilerOptions } from "@inlang/paraglide-js";

/**
 * Paths that are never locale-prefixed: `/api` is a JSON endpoint, and `/sitemap.xml` is a
 * prerendered, conventionally-located SEO file (its own content lists per-locale page URLs
 * instead). Each prefix covers the path itself and everything beneath it.
 */
export const UNLOCALIZED_PATH_PREFIXES = ["/api", "/sitemap.xml"] as const;

// All 8 locales are prefixed symmetrically, including the base locale "en"; there is no unprefixed
// default. Paraglide's built-in default pattern never prefixes the base locale, so a custom pattern
// is required to opt every locale into a prefix. The root "/" pattern is listed separately so each
// locale's home page resolves to `/<locale>` rather than `/<locale>/`.
const localizedRootPattern: [string, string][] = LOCALE_CODES.map((locale) => [
  locale,
  `/${locale}`,
]);

const localizedCatchAllPattern: [string, string][] = LOCALE_CODES.map((locale) => [
  locale,
  `/${locale}/:path(.*)?`,
]);

/**
 * The one set of Paraglide compiler options. The Vite plugin (`vite.config.ts`) and the standalone
 * compile (`pnpm run paraglide:compile`, run by `prepare`) both use it, so the runtime in
 * `src/lib/paraglide` behaves the same whichever wrote it last. Paths resolve from the repo root.
 */
export const PARAGLIDE_OPTIONS = {
  outdir: "./src/lib/paraglide",
  project: "./project.inlang",
  routeStrategies: UNLOCALIZED_PATH_PREFIXES.map((prefix) => ({
    exclude: true as const,
    match: `${prefix}/:path(.*)?`,
  })),
  strategy: ["url", "cookie", "baseLocale"],
  urlPatterns: [
    { localized: localizedRootPattern, pattern: "/" },
    { localized: localizedCatchAllPattern, pattern: "/:path(.*)?" },
  ],
} satisfies CompilerOptions;
