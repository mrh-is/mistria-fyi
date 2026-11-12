import { LOCALE_CODES } from "#lib/types/locale.js";

import { localeFromPath } from "./locale-path.js";

import type { LocaleCode } from "#lib/types/locale.js";

export const BASE_LOCALE = LOCALE_CODES[0];
export const LOCALE_COOKIE = "mistria-fyi-locale";

export function getTextDirection(_locale?: LocaleCode): "ltr" {
  // Every supported language is written left-to-right.
  return "ltr";
}

export function rememberLocale(locale: LocaleCode): void {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  try {
    // oxlint-disable-next-line unicorn/no-document-cookie -- Preserve the existing preference on browsers without the Cookie Store API.
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=34560000; SameSite=Lax${secure}`;
  } catch {
    // Opaque origins can still switch the URL even if they cannot store a preference.
  }
}

export function isLocale(value: unknown): value is LocaleCode {
  return LOCALE_CODES.some((locale) => locale === value);
}

let readServerLocale: (() => LocaleCode | undefined) | undefined;

export function setServerLocaleReader(reader: () => LocaleCode | undefined): void {
  readServerLocale = reader;
}

let localeOverride: LocaleCode | undefined;
let testLocale: (() => LocaleCode) | undefined;

/** Overrides message lookup for one synchronous call, including any nested lookups. */
export function inLocale<T>(
  locale: LocaleCode,
  read: () => T & (T extends PromiseLike<unknown> ? never : unknown),
): T {
  const previous = localeOverride;
  localeOverride = locale;
  try {
    return read();
  } finally {
    localeOverride = previous;
  }
}

export function getLocale(): LocaleCode {
  const scoped = localeOverride ?? testLocale?.() ?? readServerLocale?.();
  if (scoped) return scoped;
  if (typeof location === "undefined") return BASE_LOCALE;
  return localeFromPath(location.pathname) ?? readLocaleCookie() ?? BASE_LOCALE;
}

function readLocaleCookie(): LocaleCode | undefined {
  try {
    const prefix = `${LOCALE_COOKIE}=`;
    // oxlint-disable-next-line unicorn/no-document-cookie -- Message lookup is synchronous.
    const cookie = document.cookie.split(/;\s*/u).find((entry) => entry.startsWith(prefix));
    const value =
      cookie === undefined ? undefined : decodeURIComponent(cookie.slice(prefix.length));
    return isLocale(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Allows isolated component tests to supply a locale without navigation. */
export function overwriteGetLocale(reader?: () => LocaleCode): void {
  testLocale = reader;
}
