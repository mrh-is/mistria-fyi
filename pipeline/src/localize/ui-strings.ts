import { LOCALE_CODES } from "#lib/types/locale.js";

import { compareStrings } from "../ordering.js";

import type { LocaleCode } from "#lib/types/locale.js";

import type { ParsedGameData } from "../parse/parse-fiddle.js";
import type { Localizer } from "./localize.js";

export interface UiStringExtraction {
  localeNames: Record<LocaleCode, Record<string, string>>;
}

/**
 * A `ui` chunk entry: a bare `misc_local` key, or an `id` whose label lives under a different
 * `misc_local` key (an almanac category's `local_key`, or a menu title whose leading article the
 * app drops when it lists the category among others).
 */
export type UiStringRequest = string | { id: string; miscLocalKey: string; stripArticle?: true };

/**
 * The game vocabulary MFG's own chrome displays (category names, seasons, quest types,
 * relationship statuses, …), keyed by the id the app passes to `getName("ui", id, locale)`.
 * Almanac categories and `tier_<n>` are added per data set by the pipeline.
 */
export const APP_UI_STRINGS: readonly UiStringRequest[] = [
  { id: "almanac", miscLocalKey: "the_almanac", stripArticle: true },
  { id: "museum", miscLocalKey: "the_museum", stripArticle: true },
  "animals",
  "villagers",
  "renown",
  "skills",
  "town_rank",
  "skill_levels",
  "cooking_challenges",
  "crown_requests",
  "heart_quests",
  "mission_quests",
  "story_quests",
  "spring",
  "summer",
  "fall",
  "winter",
  "best_friend",
  "dating",
  "engaged",
  "married",
  "magic_spells",
  "mount",
  "language",
  "cancel",
  "color_variant",
];

/**
 * Leading definite articles the game puts on menu titles ("The Almanac", "Le musée"). Only the
 * languages that write one are listed; the rest pass through untouched.
 */
const LEADING_ARTICLE: Partial<Record<LocaleCode, RegExp>> = {
  en: /^The\s+/i,
  es: /^(?:El|La|Los|Las)\s+/i,
  fr: /^(?:Le|La|Les)\s+|^L'/i,
};

/** Player-gender variants: `<he>…</he><she>…</she><they>…</they>`. */
const GENDER_VARIANT = /<(he|she|they)>(.*?)<\/\1>/g;
const ANY_TAG = /<[a-z_]+>/;

/**
 * Game UI vocabulary the app displays verbatim: almanac category labels, animal variant tier
 * labels, and any other label whose in-game text lives in `fiddle/misc_local.toml`. English is
 * the bare `misc_local` entry; every other locale is keyed `misc_local/<key>` in its translation
 * table. Only the requested keys are emitted, so the `ui` chunk stays small.
 *
 * Player-gendered strings collapse to their `<they>` form; a string with any other inline markup
 * throws, since the app renders these as plain text.
 */
export function extractUiStrings(
  fiddle: ParsedGameData,
  localizer: Localizer,
  requests: readonly UiStringRequest[],
): UiStringExtraction {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<string, string>
  >;
  const miscLocal = fiddle.misc_local as Record<string, unknown> | undefined;
  if (!miscLocal) throw new Error("fiddle/misc_local.toml is missing; UI strings need it");

  const byId = new Map<string, { miscLocalKey: string; stripArticle: boolean }>();
  for (const request of requests) {
    const { id, miscLocalKey, stripArticle } =
      typeof request === "string"
        ? { id: request, miscLocalKey: request, stripArticle: false }
        : { ...request, stripArticle: request.stripArticle ?? false };
    const existing = byId.get(id);
    if (existing && existing.miscLocalKey !== miscLocalKey) {
      throw new Error(
        `UI string "${id}" requested with conflicting misc_local keys "${existing.miscLocalKey}" and "${miscLocalKey}"`,
      );
    }
    byId.set(id, { miscLocalKey, stripArticle });
  }

  for (const [id, { miscLocalKey, stripArticle }] of [...byId].toSorted(([a], [b]) =>
    compareStrings(a, b),
  )) {
    const english = miscLocal[miscLocalKey];
    if (typeof english !== "string" || english.length === 0) {
      throw new Error(`misc_local has no English string for UI key "${miscLocalKey}"`);
    }
    const { values } = localizer.localizeField({
      category: "misc_local",
      classification: "localizable",
      englishValue: english,
      id: miscLocalKey,
    });
    for (const locale of LOCALE_CODES) {
      let value = resolvePlayerGender(values[locale], miscLocalKey, locale);
      if (stripArticle) value = stripLeadingArticle(value, locale);
      localeNames[locale][id] = value;
    }
  }

  console.log(`  UI strings: ${byId.size.toString()} misc_local keys`);
  return { localeNames };
}

/** `tier_1` … `tier_<count>`, the game's labels for animal variant tiers. */
export function tierKeys(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `tier_${(index + 1).toString()}`);
}

/** Keeps the `<they>` branch of each gender variant, as the game does for a non-binary player. */
function resolvePlayerGender(value: string, miscLocalKey: string, locale: LocaleCode): string {
  const resolved = value.replaceAll(GENDER_VARIANT, (_match, gender: string, text: string) =>
    gender === "they" ? text : "",
  );
  if (ANY_TAG.test(resolved)) {
    throw new Error(
      `misc_local/${miscLocalKey} in ${locale} has inline markup the app can't render: ${JSON.stringify(value)}`,
    );
  }
  return resolved;
}

/** Drops a leading definite article and re-capitalizes what follows ("Le musée" → "Musée"). */
function stripLeadingArticle(value: string, locale: LocaleCode): string {
  const article = LEADING_ARTICLE[locale];
  if (!article) return value;
  const stripped = value.replace(article, "");
  return stripped.charAt(0).toLocaleUpperCase(locale) + stripped.slice(1);
}
