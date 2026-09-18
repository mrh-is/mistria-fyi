import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";

import { LOCALE_CODES } from "$lib/types/locale.js";

import { localizeField } from "./localize.js";

import type { LocaleCode } from "$lib/types/locale.js";

/**
 * `messages/game-terms.json`: Paraglide message keys whose text is the game's own UI vocabulary,
 * mapped to the `fiddle/misc_local.toml` key that carries it. `notes` are audit breadcrumbs for
 * near-misses and are not read here.
 */
export interface GameTermsConfig {
  notes: Record<string, string>;
  terms: Record<string, string>;
}

/** Player-gender variants (`<he>…</he><she>…</she>`) and other inline tags the game's renderer expands. */
const GAME_MARKUP = /<[a-z]+>/;

export interface GameTermDrift {
  actual: string | undefined;
  expected: string;
  locale: LocaleCode;
  messageKey: string;
}

/** The game's string for every mapped message, per locale (English is the `misc_local` entry). */
export type GameTermValues = Record<LocaleCode, Record<string, string>>;

/** Every mapped message whose text in `messages/<locale>.json` differs from the game's. */
export function findGameTermDrift(messagesDir: string, values: GameTermValues): GameTermDrift[] {
  const drift: GameTermDrift[] = [];
  for (const locale of LOCALE_CODES) {
    const messages = readMessages(messagesDir, locale);
    for (const [messageKey, expected] of Object.entries(values[locale])) {
      const actual = messages[messageKey];
      if (actual !== expected) {
        drift.push({
          actual: typeof actual === "string" ? actual : undefined,
          expected,
          locale,
          messageKey,
        });
      }
    }
  }
  return drift;
}

export function readGameTermsConfig(messagesDir: string): GameTermsConfig {
  const raw = JSON.parse(readFileSync(join(messagesDir, "game-terms.json"), "utf-8")) as Partial<
    Record<keyof GameTermsConfig, unknown>
  >;
  const terms = raw.terms;
  if (typeof terms !== "object" || terms === null || Array.isArray(terms)) {
    throw new Error("messages/game-terms.json needs a `terms` object");
  }
  for (const [messageKey, miscLocalKey] of Object.entries(terms)) {
    if (typeof miscLocalKey !== "string" || miscLocalKey.length === 0) {
      throw new Error(`game-terms.json term "${messageKey}" must name a misc_local key`);
    }
  }
  return {
    notes: (raw.notes ?? {}) as Record<string, string>,
    terms: terms as Record<string, string>,
  };
}

/**
 * Resolves every mapped term through the game's translation tables. A `misc_local` key with no
 * English entry throws; a locale missing the entry falls back to English, as the game does.
 */
export function resolveGameTerms(assetsDir: string, terms: Record<string, string>): GameTermValues {
  const miscLocal = parse(readFileSync(join(assetsDir, "fiddle", "misc_local.toml"), "utf-8"));
  const values = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as GameTermValues;

  for (const [messageKey, miscLocalKey] of Object.entries(terms)) {
    const english = miscLocal[miscLocalKey];
    if (typeof english !== "string" || english.length === 0) {
      throw new Error(
        `game-terms.json maps "${messageKey}" to misc_local/${miscLocalKey}, which has no English string`,
      );
    }
    const localized = localizeField(assetsDir, {
      category: "misc_local",
      classification: "localizable",
      englishValue: english,
      id: miscLocalKey,
    });
    for (const locale of LOCALE_CODES) {
      const value = localized.values[locale];
      if (GAME_MARKUP.test(value)) {
        throw new Error(
          `misc_local/${miscLocalKey} carries game markup in ${locale} (${JSON.stringify(value)}); Paraglide cannot render it, so map a different key or hand-write the message`,
        );
      }
      values[locale][messageKey] = value;
    }
  }
  return values;
}

/**
 * Writes the game's strings into every locale's messages file, preserving key order. A mapped
 * key that a locale file lacks throws rather than being appended: adding a message is a
 * deliberate edit to all locale files, and the key-shape check guards that.
 */
export function syncGameTerms(messagesDir: string, values: GameTermValues): GameTermDrift[] {
  const drift = findGameTermDrift(messagesDir, values);
  const missing = drift.find((entry) => entry.actual === undefined);
  if (missing) {
    throw new Error(
      `messages/${missing.locale}.json has no "${missing.messageKey}"; add the message to every locale first`,
    );
  }

  const touched = new Set(drift.map((entry) => entry.locale));
  for (const locale of touched) {
    const messages = readMessages(messagesDir, locale);
    for (const entry of drift) {
      if (entry.locale === locale) messages[entry.messageKey] = entry.expected;
    }
    writeFileSync(messagesPath(messagesDir, locale), `${JSON.stringify(messages, null, 2)}\n`);
  }
  return drift;
}

function messagesPath(messagesDir: string, locale: LocaleCode): string {
  return join(messagesDir, `${locale}.json`);
}

function readMessages(messagesDir: string, locale: LocaleCode): Record<string, unknown> {
  return JSON.parse(readFileSync(messagesPath(messagesDir, locale), "utf-8")) as Record<
    string,
    unknown
  >;
}
