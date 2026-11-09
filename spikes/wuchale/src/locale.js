import { LOCALE_CODES } from "#lib/types/locale.js";

export const locales = LOCALE_CODES;

/** @param {string | undefined} locale */
export function resolveLocale(locale) {
  return locales.find((supported) => supported.toLowerCase() === locale?.toLowerCase()) ?? "en";
}
