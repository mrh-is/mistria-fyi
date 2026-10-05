import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getName, getNameTable, nameCollator } from "#lib/data/names.js";
import { LOCALE_CODES } from "#lib/types/locale.js";
import { recordKeys } from "#lib/utils.js";

import type {
  FestivalId,
  ItemId,
  PetCosmeticSetId,
  RecipeId,
  SkillId,
  VillagerId,
} from "#lib/types/tracker-data.js";

const balor = "balor" as VillagerId;
const farming = "farming" as SkillId;
const harvestFestival = "harvest" as FestivalId;
const halo = "halo" as PetCosmeticSetId;
const turnip = "turnip" as ItemId;

describe("getName", () => {
  it("resolves the localized name for a translated locale", () => {
    expect(getName("villagers", balor, "en")).toBe("Balor");
    expect(getName("villagers", balor, "ja")).toBe("バロル");
  });

  it("resolves every Villager in every locale", () => {
    for (const id of recordKeys(trackerData.villagers)) {
      for (const locale of LOCALE_CODES) {
        expect(getName("villagers", id, locale).length, `${id}/${locale}`).toBeGreaterThan(0);
      }
    }
  });

  it("resolves localized skill names without retaining them in structural data", () => {
    expect(getName("skills", farming, "en")).toBe("Farming");
    expect(getName("skills", farming, "ja")).toBe("農業");

    for (const id of recordKeys(trackerData.skills)) {
      for (const locale of LOCALE_CODES) {
        expect(getName("skills", id, locale).length, `skills/${id}/${locale}`).toBeGreaterThan(0);
      }
    }
    expect("name" in trackerData.skills[farming]).toBe(false);
  });

  it("resolves migrated direct and nested metadata names from non-Latin chunks", () => {
    expect(getName("festivals", harvestFestival, "ja")).toBe("収穫祭");
    expect(getName("pets/cosmetic_sets", halo, "ja")).toBe("天使の輪");
    expect(getName("museum_wings", "archaeology/sets/aldarian", "ja")).toBe("アルダリア遺物セット");
    expect("name" in trackerData.festivals[harvestFestival]).toBe(false);
    expect("name" in trackerData.pets.cosmetics[halo]).toBe(false);
  });

  it("resolves item-derived names without retaining structural display fields", () => {
    expect(getName("items", turnip, "en")).toBe("Turnip");
    expect(getName("items", turnip, "ja")).not.toBe("Turnip");
    expect(getName("recipes", "vegetable_soup" as RecipeId, "ja").length).toBeGreaterThan(0);

    const [petSkinId] = recordKeys(trackerData.pets.skins);
    expect(getName("pets/skins", petSkinId, "ja")).not.toMatch(/^Pet Skin:/i);
    expect("name" in trackerData.items[turnip]).toBe(false);
    expect("name" in trackerData.recipes["vegetable_soup" as RecipeId]).toBe(false);
    expect("name" in trackerData.pets.skins[petSkinId]).toBe(false);
  });

  // The locale-missing → throw path lives in `names.fallback.cold.test.ts`, which needs a partial chunk
  // the pipeline never emits.
  it("throws rather than inventing a name for an unknown ID", () => {
    const missingVillagerId = "not_a_real_villager" as VillagerId;
    expect(() => getName("villagers", missingVillagerId, "ja")).toThrow(/No "villagers" name/);
    expect(() => getName("villagers", missingVillagerId, "en")).toThrow(/in locale "en"/);
  });

  it("accepts only Villager IDs for the Villager category", () => {
    // @ts-expect-error Localized name lookups preserve the category's branded ID type.
    getName("villagers", "balor", "en");
  });

  it("gives independent results for two locales interleaved in one process", () => {
    // Simulates concurrent SSR requests in different locales sharing one module instance: the
    // guard against any ambient "current locale" being reintroduced under `getName`.
    const ids = recordKeys(trackerData.villagers).slice(0, 10);
    const pairs = ids.flatMap((id) => [
      { expected: getNameTable("villagers", "en")[id], id, locale: "en" as const },
      { expected: getNameTable("villagers", "ja")[id], id, locale: "ja" as const },
    ]);

    // Interleaved, then reversed, then shuffled — order must never change any single answer.
    for (const order of [pairs, [...pairs].reverse(), [...pairs].sort(() => 0.5 - Math.random())]) {
      for (const { expected, id, locale } of order) {
        expect(getName("villagers", id, locale)).toBe(expected);
      }
    }

    // And at least one of the sampled Villagers must actually differ between the two locales, so the
    // assertion above can't pass trivially on identical tables.
    expect(
      ids.some((id) => getName("villagers", id, "en") !== getName("villagers", id, "ja")),
    ).toBe(true);
  });

  it("resolves concurrently from independently-awaited tasks", async () => {
    const ids = recordKeys(trackerData.villagers);
    const [english, japanese] = await Promise.all([
      Promise.resolve().then(() => ids.map((id) => getName("villagers", id, "en"))),
      Promise.resolve().then(() => ids.map((id) => getName("villagers", id, "ja"))),
    ]);

    expect(english).toStrictEqual(ids.map((id) => getNameTable("villagers", "en")[id]));
    expect(japanese).toStrictEqual(ids.map((id) => getNameTable("villagers", "ja")[id]));
    expect(english).not.toStrictEqual(japanese);
  });
});

describe("getNameTable", () => {
  it("merges the English chunk under the requested locale", () => {
    const table = getNameTable("villagers", "ja");
    expect(Object.keys(table).sort()).toStrictEqual([...recordKeys(trackerData.villagers)].sort());
    expect(table[balor]).toBe("バロル");
  });

  it("returns the English chunk unchanged for en", () => {
    expect(getNameTable("villagers", "en")[balor]).toBe("Balor");
  });
});

describe("nameCollator", () => {
  it("sorts with the requested locale's collation and memoizes per locale", () => {
    expect(nameCollator("en")).toBe(nameCollator("en"));
    expect(nameCollator("ja")).not.toBe(nameCollator("en"));
    expect(nameCollator("en").compare("Adeline", "Balor")).toBeLessThan(0);
  });
});
