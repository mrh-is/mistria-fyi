import { describe, expect, it } from "vitest";

import { makeFiddle } from "../test-helpers.js";
import { collectNativeReferenceRegistries } from "./native-references.js";
import { AcquisitionReferenceIndex } from "./reference-index.js";
import { REVIEWED_NON_NATIVE_REFERENCES } from "./reviewed-references.js";
import { validateAcquisitionSources } from "./validate-sources.js";

import type { AcquisitionSourceAssembly } from "./validate-sources.js";

function validTables(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cutscenes: { default: {}, great_bird_0: {} },
    dates: { beach: {}, default: {}, wedding: { unlisted: true } },
    fish: {
      carp: { water_type: ["pond", "river"] },
      cave_fish: {},
      default: { water_type: "river" },
      tuna: { water_type: "ocean" },
    },
    fishing: { chest_tables: { default: {}, gold: {} } },
    letters: { birthday_gift: {}, default: {} },
    locations: { beach: {}, default: {}, farm: {} },
    misc: { pumpkin_patch_options: [] },
    monsters: { cat: { cat: {}, cat_void: {}, default: {} } },
    object_prototypes: { furniture: { apiary: {}, default: {} } },
    quests: {
      crown_registry: { order: [] },
      story_quests: { default: {}, repair_the_bridge: {} },
    },
    ...overrides,
  };
}

describe("collectNativeReferenceRegistries", () => {
  it("reads every registry from parsed game tables", () => {
    expect(collectNativeReferenceRegistries(makeFiddle(validTables()))).toEqual({
      activities: ["pumpkin_patch"],
      cutscenes: ["great_bird_0"],
      dates: ["beach", "wedding"],
      letters: ["birthday_gift"],
      locations: ["beach", "farm"],
      monsters: ["cat", "cat_void"],
      quests: ["repair_the_bridge"],
      stations: ["apiary"],
      treasureChestTiers: ["gold"],
      waterTypes: ["pond", "river", "ocean"],
    });
  });

  it("registers an activity only when a backing table exists", () => {
    const registries = collectNativeReferenceRegistries(
      makeFiddle(validTables({ misc: { small_animal_festival_rewards: [] } })),
    );

    expect(registries.activities).toEqual(["animal_contest"]);
  });

  it.each([
    ["locations", undefined, "Expected game table locations to be a table, got undefined"],
    ["monsters", { cat: ["cat"] }, "Expected monsters.cat to be a table, got array"],
    ["fish", { carp: { water_type: 3 } }, "Expected fish.carp.water_type to hold strings"],
    ["misc", { pumpkin_patch_options: "pumpkin" }, "Expected misc.pumpkin_patch_options"],
    ["fishing", {}, "Expected game table fishing.chest_tables to be a table"],
  ])("throws when %s has an unexpected shape", (table, value, message) => {
    expect(() =>
      collectNativeReferenceRegistries(makeFiddle(validTables({ [table]: value }))),
    ).toThrow(message);
  });
});

/** A Mines-chest date drop gated on `dateId` not yet being unlocked. */
function dateDropFor(dateId: string) {
  return {
    type: "date_inspiration_drop",
    activity: "mines_chest",
    availability: { type: "not", condition: { type: "dateUnlocked", dateId } },
    dateId: "beach",
  };
}

describe("validation against native registries", () => {
  it("rejects a bogus override quest ID even though a source names it", () => {
    expect(() => {
      validate([
        { type: "quest", questId: "repair_the_brigde", questType: "story", trigger: "completion" },
      ]);
    }).toThrow(
      '[unresolved-reference] reward at items.reward.sources[0].questId: Unknown quest ID "repair_the_brigde"',
    );
  });

  it("rejects a misspelled override monster", () => {
    expect(() => {
      validate([{ type: "monster", monsterId: "void_cat" }]);
    }).toThrow('Unknown monster ID "void_cat"');
  });

  it("rejects a cutscene ID used as a quest", () => {
    expect(() => {
      validate([{ type: "quest", questId: "great_bird_0", trigger: "completion" }]);
    }).toThrow('Unknown quest ID "great_bird_0"');
  });

  it("rejects a cutscene the game defines but no reviewed wording covers", () => {
    expect(() => {
      validate([{ type: "cutscene", cutsceneId: "great_bird_1" }]);
    }).toThrow("items.reward.sources[0].cutsceneId: Expected a reviewed cutscene id");
  });

  it("validates letter IDs against native letters instead of source payloads", () => {
    expect(() => {
      validate([{ type: "letter", letterId: "birthday_gift", trigger: "birthday" }]);
    }).not.toThrow();
    expect(() => {
      validate([{ type: "letter", letterId: "birthday_gfit", trigger: "birthday" }]);
    }).toThrow('Unknown letter ID "birthday_gfit"');
    expect(() => {
      validate([{ type: "letter", trigger: "birthday" }]);
    }).toThrow("items.reward.sources[0].letterId");
  });

  it("validates a date-unlock window's date against native dates", () => {
    expect(() => {
      validate([dateDropFor("beach")]);
    }).not.toThrow();
    expect(() => {
      validate([dateDropFor("beech")]);
    }).toThrow('Unknown date ID "beech"');
  });

  it("accepts native and reviewed IDs", () => {
    expect(() => {
      validate([
        { type: "cutscene", cutsceneId: "great_bird_0" },
        { type: "monster", monsterId: "cat_void" },
        { type: "monster", monsterId: "any" },
        { type: "forage", locationIds: ["beach", "mines"] },
        { type: "fish", waterTypes: ["pond"] },
        { type: "station", stationId: "apiary" },
        { type: "date", dateId: "wedding" },
      ]);
    }).not.toThrow();
  });
});

function validate(itemSources: unknown[]): void {
  const registries = collectNativeReferenceRegistries(makeFiddle(validTables()));
  const references = AcquisitionReferenceIndex.from({
    emitted: { items: ["reward"] },
    native: { ...registries, questTypes: ["story"] },
    reviewed: REVIEWED_NON_NATIVE_REFERENCES,
  });
  const trackerData = {
    almanac: {},
    animals: {},
    categoryVisibility: {},
    cosmetics: {},
    items: { reward: { sources: itemSources } },
    mines: { biomes: [], spells: {} },
    mount: { appearances: {}, perks: {} },
    museum: {},
    pets: { cosmetics: {}, skins: {} },
    quests: {},
    recipes: {},
    stores: {},
    villagers: {},
  } as unknown as AcquisitionSourceAssembly;
  validateAcquisitionSources(trackerData, references);
}
