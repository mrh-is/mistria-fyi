import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createMemoryLocalizer, makeFiddle } from "../test-helpers.js";
import { extractGameTermLexicon, stageGameTermLexicon } from "./game-term-lexicon.js";
import { GAME_LANGUAGE_TO_LOCALE } from "./locale-codes.js";

const english = {
  "locations/earth_seal/name": "The Earth Seal",
  "locations/fire_seal/name": "The Fire Seal",
  "locations/future_seal/name": "The Future Seal",
  "locations/ruins_seal/name": "The Ruins Seal",
  "locations/void_seal/name": "The Void Seal",
  "locations/water_seal/name": "The Water Seal",
  "misc_local/fishing_and_diving": "Fishing and Diving",
  "misc_local/the_almanac": "The Almanac",
  "ui/skill_menu/farming/name": "Farming",
};
const japanese = {
  ...english,
  "locations/water_seal/name": "水の封印",
  "misc_local/fishing_and_diving": "釣りと潜水",
  "ui/skill_menu/farming/name": "農業",
};

const songCrystalKey = "misc_local/song_crystal_alias";
const farmingKey = "ui/skill_menu/farming/name";

function fixture(overrides: Record<string, unknown> = {}) {
  return makeFiddle({
    locations: {
      earth_seal: { name: "The Earth Seal" },
      fire_seal: { name: "The Fire Seal" },
      future_seal: { name: "The Future Seal" },
      ruins_seal: { name: "The Ruins Seal" },
      void_seal: { name: "The Void Seal" },
      water_seal: { name: "The Water Seal" },
    },
    misc_local: {
      fishing_and_diving: "Fishing and Diving",
      song_crystal_alias: "Song Crystals",
      the_almanac: "The Almanac",
    },
    skills: { default: {}, farming: {} },
    ui: {
      menus: {
        sub_menus: {
          almanac: {
            categories: [
              { key: "fish", local_key: "misc_local/fishing_and_diving", tags: ["fishable"] },
              { key: "song_crystal", local_key: songCrystalKey, tags: ["song_crystal"] },
            ],
          },
        },
      },
    },
    ...overrides,
  });
}

function localizer({
  frenchSongCrystal = "Cristaux",
  japaneseSongCrystal,
  missingSkill = false,
  waterSeal = "水の封印",
}: {
  frenchSongCrystal?: string;
  japaneseSongCrystal?: string;
  missingSkill?: boolean;
  waterSeal?: null | string;
} = {}) {
  const source: Record<string, string> = { ...english, [songCrystalKey]: "Song Crystals" };
  const japaneseTerms: Record<string, string> = {
    ...japanese,
  };
  if (waterSeal === null) delete japaneseTerms["locations/water_seal/name"];
  else japaneseTerms["locations/water_seal/name"] = waterSeal;
  if (japaneseSongCrystal !== undefined) japaneseTerms[songCrystalKey] = japaneseSongCrystal;
  if (missingSkill) {
    delete source["ui/skill_menu/farming/name"];
    delete japaneseTerms["ui/skill_menu/farming/name"];
  }
  const languages = Object.keys(GAME_LANGUAGE_TO_LOCALE).filter((language) => language !== "eng");
  return createMemoryLocalizer({
    source_caches: Object.fromEntries(languages.map((language) => [language, source])),
    translations: Object.fromEntries(
      languages.map((language) => [
        language,
        language === "jpn"
          ? japaneseTerms
          : { ...source, ...(language === "fra" && { [songCrystalKey]: frenchSongCrystal }) },
      ]),
    ),
  });
}

describe("extractGameTermLexicon", () => {
  it("groups native terms by app locale and retains their native lookup keys", () => {
    const lexicon = extractGameTermLexicon(fixture(), localizer());

    expect(Object.keys(lexicon).toSorted()).toEqual(
      Object.values(GAME_LANGUAGE_TO_LOCALE).toSorted(),
    );
    expect(lexicon.en).toEqual(english);
    expect(lexicon.ja).toEqual(japanese);
  });

  it.each([{ waterSeal: null }, { waterSeal: " " }])(
    "rejects a missing or blank translation (%j)",
    (options) => {
      expect(() => extractGameTermLexicon(fixture(), localizer(options))).toThrow(
        'Missing game term "locations/water_seal/name" for locale "ja"',
      );
    },
  );

  it("rejects a missing English term", () => {
    const fiddle = fixture({ locations: { earth_seal: {} } });
    expect(() => extractGameTermLexicon(fiddle, localizer())).toThrow(
      'Missing game term "locations/earth_seal/name" for locale "en"',
    );
  });

  it.each([
    [{ ui: {} }, "Missing Almanac categories"],
    [{ skills: { default: {} } }, "Missing skill names"],
    [{ locations: { farm: {} } }, "Missing mine seal locations"],
  ])("requires the expected source tables (%j)", (overrides, message) => {
    expect(() => extractGameTermLexicon(fixture(overrides), localizer())).toThrow(message);
  });

  it("requires an English source cache for a reviewed skill name", () => {
    expect(() => extractGameTermLexicon(fixture(), localizer({ missingSkill: true }))).toThrow(
      `Missing English source cache for "${farmingKey}"`,
    );
  });

  it("includes the aliased song crystal label when the Japanese translation exists", () => {
    const lexicon = extractGameTermLexicon(
      fixture(),
      localizer({ japaneseSongCrystal: "歌の結晶" }),
    );
    expect(lexicon.ja[songCrystalKey]).toBe("歌の結晶");
  });

  it("does not waive a song crystal gap outside Japanese", () => {
    expect(() => extractGameTermLexicon(fixture(), localizer({ frenchSongCrystal: " " }))).toThrow(
      `Missing game term "${songCrystalKey}" for locale "fr"`,
    );
  });

  it("stages the versioned artifact in the pipeline output directory", () => {
    const pipelineRoot = resolve("pipeline");
    const file = stageGameTermLexicon(pipelineRoot, "2.3.4", fixture(), localizer());

    expect(file.path).toBe(resolve(pipelineRoot, "output", "game-term-lexicon.json"));
    expect(JSON.parse(file.content)).toMatchObject({ locales: { ja: japanese }, version: "2.3.4" });
  });
});
