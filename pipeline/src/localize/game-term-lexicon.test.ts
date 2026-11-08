import { describe, expect, it } from "vitest";

import { createMemoryLocalizer, makeFiddle } from "../test-helpers.js";
import { extractGameTermLexicon } from "./game-term-lexicon.js";
import { GAME_LANGUAGE_TO_LOCALE } from "./locale-codes.js";

const english = {
  "locations/earth_seal/name": "The Earth Seal",
  "locations/fire_seal/name": "The Fire Seal",
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

function fixture(missingEnglish = false) {
  return makeFiddle({
    locations: {
      earth_seal: { name: missingEnglish ? "" : "The Earth Seal" },
      fire_seal: { name: "The Fire Seal" },
      ruins_seal: { name: "The Ruins Seal" },
      void_seal: { name: "The Void Seal" },
      water_seal: { name: "The Water Seal" },
    },
    misc_local: { fishing_and_diving: "Fishing and Diving", the_almanac: "The Almanac" },
    skills: { default: {}, farming: {} },
    ui: {
      menus: {
        sub_menus: {
          almanac: {
            categories: [
              { key: "fish", local_key: "misc_local/fishing_and_diving", tags: ["fishable"] },
              { key: "song_crystal", tags: ["song_crystal"] },
            ],
          },
        },
      },
    },
  });
}

function localizer(waterSeal: string | undefined) {
  const japaneseTerms: Record<string, string> = { ...japanese };
  if (waterSeal === undefined) delete japaneseTerms["locations/water_seal/name"];
  else japaneseTerms["locations/water_seal/name"] = waterSeal;
  const languages = Object.keys(GAME_LANGUAGE_TO_LOCALE).filter((language) => language !== "eng");
  return createMemoryLocalizer({
    source_caches: Object.fromEntries(languages.map((language) => [language, english])),
    translations: Object.fromEntries(
      languages.map((language) => [language, language === "jpn" ? japaneseTerms : english]),
    ),
  });
}

describe("extractGameTermLexicon", () => {
  it("groups native terms by app locale and retains their native lookup keys", () => {
    const lexicon = extractGameTermLexicon(fixture(), localizer("水の封印"));

    expect(Object.keys(lexicon).toSorted()).toEqual(
      Object.values(GAME_LANGUAGE_TO_LOCALE).toSorted(),
    );
    expect(lexicon.en).toEqual(english);
    expect(lexicon.ja).toEqual(japanese);
  });

  it.each([undefined, " "])("rejects a missing or blank translation (%s)", (waterSeal) => {
    expect(() => extractGameTermLexicon(fixture(), localizer(waterSeal))).toThrow(
      'Missing game term "locations/water_seal/name" for locale "ja"',
    );
  });

  it("rejects a missing English term", () => {
    const fiddle = fixture(true);
    expect(() => extractGameTermLexicon(fiddle, localizer("水の封印"))).toThrow(
      'Missing game term "locations/earth_seal/name" for locale "en"',
    );
  });
});
