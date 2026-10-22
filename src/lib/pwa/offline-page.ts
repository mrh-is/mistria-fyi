import type { LocaleCode } from "#lib/types/locale.js";

/** The slot the worker fills with the locale's font stylesheet, which only it can find (#206). */
export const OFFLINE_FONTS_SLOT = "offline.fonts";

/**
 * The offline page as `offlinePagePlugin` (src/lib/build/offline-page.ts) bundles it into the
 * worker: one shell, and each locale's text for its slots, so a page in every locale costs one copy
 * of the shell's styles & scripts.
 */
export interface OfflinePage {
  /** Every locale's HTML-escaped value for each slot but {@link OFFLINE_FONTS_SLOT}. */
  copy: Readonly<Record<LocaleCode, Readonly<Record<string, string>>>>;
  /** The page's HTML around its slots: one more part than there are slots. */
  parts: readonly string[];
  /** The slot between each pair of parts, in page order. */
  slots: readonly string[];
}

/** Escapes text for an HTML text node or a double-quoted attribute value. */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * `page` in `locale`, linking `fontStylesheet` (the locale's `@font-face` stylesheet, when it has
 * one) so its `html:lang()` font stacks find their faces once that stylesheet is cached.
 */
export function offlinePageHtml(
  page: OfflinePage,
  locale: LocaleCode,
  fontStylesheet: string | undefined,
): string {
  const values: Readonly<Partial<Record<string, string>>> = {
    ...page.copy[locale],
    [OFFLINE_FONTS_SLOT]:
      fontStylesheet === undefined
        ? ""
        : `<link rel="stylesheet" href="${escapeHtml(fontStylesheet)}" />`,
  };
  return page.parts
    .map((part, index) => {
      if (index === 0) return part;
      const slot = page.slots[index - 1] ?? "";
      const value = values[slot];
      if (value === undefined) throw new Error(`The offline page has no ${locale} ${slot} value.`);
      return value + part;
    })
    .join("");
}
