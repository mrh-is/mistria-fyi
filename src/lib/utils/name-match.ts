import type { LocaleCode } from "#lib/types/locale.js";

/** Combining marks, except the kana voicing marks (゛ ゜), which change the syllable itself. */
const DIACRITICS = /(?![\u{3099}\u{309A}])\p{M}/gu;
/** Katakana ァ–ヶ, which sit exactly 0x60 above their hiragana counterparts. */
const KATAKANA = /[\u{30A1}-\u{30F6}]/gu;
const KATAKANA_TO_HIRAGANA_OFFSET = 0x60;

/**
 * Folds `text` into the form name filters compare: compatibility forms and full-width Latin
 * collapse (NFKC), case lowers per `locale`, diacritics drop ("é" → "e"), and katakana becomes
 * hiragana. Deliberately looser than `nameCollator`'s sort order: a filter that over-matches
 * costs a glance, while one that misses a name hides it.
 */
export function foldName(text: string, locale: LocaleCode): string {
  // Printable ASCII needs no normalization, mark removal, or kana conversion. All supported locales use
  // the same ASCII case mapping, so avoid the Unicode pipeline for these common names & queries.
  if (/^[\u0020-\u007E]*$/.test(text)) return text.toLowerCase();

  return text
    .normalize("NFKC")
    .toLocaleLowerCase(locale)
    .normalize("NFD")
    .replaceAll(DIACRITICS, "")
    .replaceAll(KATAKANA, (kana) =>
      String.fromCodePoint((kana.codePointAt(0) ?? 0) - KATAKANA_TO_HIRAGANA_OFFSET),
    )
    .normalize("NFC");
}

/**
 * Whether `name` contains `query` once both are folded per {@link foldName}. A blank query matches
 * every name.
 */
export function matchesName(name: string, query: string, locale: LocaleCode): boolean {
  const folded = foldName(query.trim(), locale);
  return !folded || foldName(name, locale).includes(folded);
}
