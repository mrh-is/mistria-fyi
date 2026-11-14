import { LOCALE_CODES } from "#lib/types/locale.js";

import type { LocaleCode } from "#lib/types/locale.js";

export const UNLOCALIZED_PATH_PREFIXES = ["/api", "/sitemap.xml"] as const;

export function localeFromPath(pathname: string): LocaleCode | undefined {
  const segment = pathname.split("/")[1];
  return LOCALE_CODES.find((locale) => locale === segment);
}

export function stripLocale(pathname: string): string {
  const locale = localeFromPath(pathname);
  if (!locale) return pathname;
  const bare = pathname.slice(locale.length + 1);
  return bare.startsWith("//") ? pathname : bare || "/";
}

export function isUnlocalizedPath(pathname: string): boolean {
  return UNLOCALIZED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function localizePath(pathname: string, locale: LocaleCode): string {
  const bare = stripLocale(pathname);
  if (isUnlocalizedPath(bare)) return bare;
  return `/${locale}${bare === "/" ? "" : bare}`;
}

export function localizeUrl(url: URL, locale: LocaleCode): URL {
  const localized = new URL(url);
  localized.pathname = localizePath(url.pathname, locale);
  return localized;
}
