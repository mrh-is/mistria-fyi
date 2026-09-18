import { describe, expect, it } from "vitest";

import { makeFiddle, requireGameAssetsDir } from "../test-helpers";
import { extractNpcs } from "./npcs";

import type { NpcId } from "$lib/types/tracker-data.js";

const balor = "balor" as NpcId;
const adeline = "adeline" as NpcId;
/** No `npcs/<id>/name` key exists for this ID in any translation table, so every locale falls back. */
const untranslated = "definitely_not_a_real_npc_id" as NpcId;

function extract() {
  return extractNpcs(
    makeFiddle({
      npcs: {
        [adeline]: { birthday: { day: 3, season: "spring" }, dateable: true, name: "Adeline" },
        [balor]: { birthday: { day: 10, season: "summer" }, name: "Balor" },
        default: { birthday: { day: 1, season: "spring" }, name: "Default" },
        [untranslated]: { birthday: { day: 1, season: "fall" }, name: "Nonexistent NPC" },
      },
    }),
    requireGameAssetsDir(),
  );
}

describe("extractNpcs — real assets", () => {
  it("omits name from the structural NPC record", () => {
    const { npcs } = extract();

    expect(npcs[balor]).toStrictEqual({ birthday: { day: 10, season: "summer" } });
    expect(npcs[adeline]).toStrictEqual({
      birthday: { day: 3, season: "spring" },
      dateable: true,
    });
    expect(npcs["default" as NpcId]).toBeUndefined();
  });

  it("emits a name chunk for every locale", () => {
    const { localeNames } = extract();

    expect(Object.keys(localeNames).sort()).toStrictEqual(
      ["en", "es", "fr", "ja", "ko", "ru", "zh-Hans", "zh-Hant"].sort(),
    );
    for (const chunk of Object.values(localeNames)) {
      expect(Object.keys(chunk).sort()).toStrictEqual([adeline, balor, untranslated].sort());
    }
  });

  it("resolves real translations across locales", () => {
    const { localeNames } = extract();

    expect(localeNames.en[balor]).toBe("Balor");
    expect(localeNames.ja[balor]).toBe("バロル");
    expect(localeNames.ja[adeline]).toBe("アデライン");

    // Every non-English locale should differ from English for at least one sampled NPC, proving
    // the chunks carry real translation data rather than a silently English-filled table.
    for (const locale of ["ja", "zh-Hans", "zh-Hant", "ko", "ru"] as const) {
      expect(localeNames[locale][balor]).not.toBe("Balor");
    }
  });

  it("falls back to the English value in every locale when the key is missing", () => {
    const { localeNames } = extract();

    for (const chunk of Object.values(localeNames)) {
      expect(chunk[untranslated]).toBe("Nonexistent NPC");
    }
  });
});
