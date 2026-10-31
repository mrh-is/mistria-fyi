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

/**
 * Whether `query` finds a row through its secondary `terms`, such as a variant word: every word of
 * the query appears in one of `names` or `terms`, and at least one appears in a term. So “white
 * window” finds “Animated Clouds Window” (variant “White”), while a reordered name alone (“window
 * clouds”) doesn’t match. Callers rank these matches below name matches.
 */
export function matchesTerms(
  names: readonly string[],
  terms: readonly string[],
  query: string,
  locale: LocaleCode,
): boolean {
  const words = foldName(query.trim(), locale).split(/\s+/u).filter(Boolean);
  if (words.length === 0 || terms.length === 0) return false;
  const foldedNames = names.map((name) => foldName(name, locale));
  const foldedTerms = terms.map((term) => foldName(term, locale));
  const inTerm = (word: string): boolean => foldedTerms.some((term) => term.includes(word));
  return (
    words.some((word) => inTerm(word)) &&
    words.every((word) => inTerm(word) || foldedNames.some((name) => name.includes(word)))
  );
}
