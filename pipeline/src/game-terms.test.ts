import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findGameTermDrift,
  readGameTermsConfig,
  resolveGameTerms,
  syncGameTerms,
} from "./game-terms.js";

import type { GameTermValues } from "./game-terms.js";

const temporaryDirectories: string[] = [];

const localizeField = vi.hoisted(() =>
  vi.fn((_assetsDir: string, input: { englishValue: string; id: string }) => ({
    fallbackLocales: [],
    values: {
      en: input.englishValue,
      es: input.id === "engaged" ? "<he>Prometido</he><she>Prometida</she>" : input.englishValue,
      fr: input.englishValue,
      ja: `JA ${input.englishValue}`,
      ko: input.englishValue,
      ru: input.englishValue,
      "zh-Hans": input.englishValue,
      "zh-Hant": input.englishValue,
    },
  })),
);

vi.mock("./localize.js", () => ({ localizeField }));

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function makeAssets(miscLocal: string): string {
  const assetsDir = mkdtempSync(join(tmpdir(), "mistria-fyi-game-terms-assets-"));
  temporaryDirectories.push(assetsDir);
  mkdirSync(join(assetsDir, "fiddle"));
  writeFileSync(join(assetsDir, "fiddle", "misc_local.toml"), miscLocal);
  return assetsDir;
}

function makeMessages(files: Record<string, unknown>): string {
  const messagesDir = mkdtempSync(join(tmpdir(), "mistria-fyi-game-terms-messages-"));
  temporaryDirectories.push(messagesDir);
  for (const [name, contents] of Object.entries(files)) {
    writeFileSync(join(messagesDir, `${name}.json`), JSON.stringify(contents, null, 2));
  }
  return messagesDir;
}

const ALL_LOCALES = ["en", "es", "fr", "ja", "ko", "ru", "zh-Hans", "zh-Hant"];

describe("readGameTermsConfig", () => {
  it("reads terms and notes", () => {
    const messagesDir = makeMessages({
      "game-terms": { notes: { x: "why" }, terms: { season_fall: "fall" } },
    });
    expect(readGameTermsConfig(messagesDir)).toEqual({
      notes: { x: "why" },
      terms: { season_fall: "fall" },
    });
  });

  it("throws when a term does not name a misc_local key", () => {
    const messagesDir = makeMessages({ "game-terms": { terms: { season_fall: 3 } } });
    expect(() => readGameTermsConfig(messagesDir)).toThrow(/"season_fall" must name/);
  });
});

describe("resolveGameTerms", () => {
  it("localizes each term through misc_local", () => {
    const assetsDir = makeAssets('fall = "Fall"\nrenown = "Renown"\n');
    const values = resolveGameTerms(assetsDir, {
      category_renown_name: "renown",
      season_fall: "fall",
    });
    expect(values.en).toEqual({ category_renown_name: "Renown", season_fall: "Fall" });
    expect(values.ja).toEqual({ category_renown_name: "JA Renown", season_fall: "JA Fall" });
    expect(localizeField).toHaveBeenCalledWith(assetsDir, {
      category: "misc_local",
      classification: "localizable",
      englishValue: "Fall",
      id: "fall",
    });
  });

  it("throws when misc_local lacks the English string", () => {
    const assetsDir = makeAssets('fall = "Fall"\n');
    expect(() => resolveGameTerms(assetsDir, { season_spring: "spring" })).toThrow(
      /misc_local\/spring, which has no English string/,
    );
  });

  it("refuses a game string with player-gender markup", () => {
    const assetsDir = makeAssets('engaged = "Engaged"\n');
    expect(() => resolveGameTerms(assetsDir, { relationship_status_engaged: "engaged" })).toThrow(
      /carries game markup in es/,
    );
  });
});

describe("syncGameTerms", () => {
  const values = Object.fromEntries(
    ALL_LOCALES.map((locale) => [locale, { season_fall: locale === "ja" ? "秋" : "Fall" }]),
  ) as unknown as GameTermValues;

  it("reports drift per locale and message", () => {
    const messagesDir = makeMessages(
      Object.fromEntries(
        ALL_LOCALES.map((locale) => [locale, { other: "x", season_fall: "Autumn" }]),
      ),
    );
    const drift = findGameTermDrift(messagesDir, values);
    expect(drift).toHaveLength(8);
    expect(drift.find((entry) => entry.locale === "ja")).toEqual({
      actual: "Autumn",
      expected: "秋",
      locale: "ja",
      messageKey: "season_fall",
    });
  });

  it("writes the game's strings and leaves other keys and their order alone", () => {
    const messagesDir = makeMessages(
      Object.fromEntries(
        ALL_LOCALES.map((locale) => [
          locale,
          { $schema: "x", season_fall: locale === "en" ? "Fall" : "Autumn", zzz: "last" },
        ]),
      ),
    );

    const drift = syncGameTerms(messagesDir, values);

    expect(drift.map((entry) => entry.locale)).not.toContain("en");
    expect(readFileSync(join(messagesDir, "ja.json"), "utf-8")).toBe(
      `${JSON.stringify({ $schema: "x", season_fall: "秋", zzz: "last" }, null, 2)}\n`,
    );
    expect(findGameTermDrift(messagesDir, values)).toEqual([]);
  });

  it("throws instead of appending a message a locale lacks", () => {
    const messagesDir = makeMessages(
      Object.fromEntries(
        ALL_LOCALES.map((locale) => [locale, locale === "fr" ? {} : { season_fall: "Fall" }]),
      ),
    );
    expect(() => syncGameTerms(messagesDir, values)).toThrow(
      /messages\/fr.json has no "season_fall"/,
    );
  });
});
