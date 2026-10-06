import { assert, describe, expect, it } from "vitest";

import { getExcludedCosmeticIds } from "./exclusions.js";
import { AcquisitionReferenceIndex } from "./reference-index.js";
import { CosmeticSourceAccumulator, ItemSourceAccumulator } from "./source-accumulator.js";
import {
  AcquisitionSourceValidationError,
  validateAcquisitionSources,
} from "./validate-sources.js";

import type { Source } from "#lib/types/acquisition.js";

import type { AcquisitionSourceAssembly } from "./validate-sources.js";

describe("validateAcquisitionSources", () => {
  it("rejects a table-excluded cosmetic reintroduced after extraction", () => {
    const trackerData = { cosmetics: { head_flower_hat: { sources: [{ type: "default" }] } } };
    const references = AcquisitionReferenceIndex.from({
      emitted: { cosmetics: trackerData.cosmetics },
      excluded: { cosmetics: getExcludedCosmeticIds() },
    });
    expect(captureDiagnostics(trackerData, references)).toEqual([
      expect.objectContaining({
        fieldPath: "cosmetics.head_flower_hat",
        kind: "excluded-id-reference",
      }),
    ]);
  });

  it.each(["mine", "mines_chest", "mines_dig_site"])(
    "rejects a %s source without biomeId",
    (type) => {
      const trackerData = {
        cosmetics: {},
        items: { void_herb: { sources: [{ type }] } },
        recipes: {},
      };
      const references = AcquisitionReferenceIndex.from({
        emitted: { items: trackerData.items },
      });

      expect(() => {
        validateAcquisitionSources(assembly(trackerData), references);
      }).toThrow("items.void_herb.sources[0].biomeId");
    },
  );

  it("allows mine_fish without biomeId", () => {
    const trackerData = {
      cosmetics: {},
      items: { cave_fish: { sources: [{ type: "mine_fish" }] } },
      recipes: {},
    };
    const references = AcquisitionReferenceIndex.from({ emitted: { items: trackerData.items } });

    expect(() => {
      validateAcquisitionSources(assembly(trackerData), references);
    }).not.toThrow();
  });

  it.each([
    { type: "chicken_statue", cost: 10 },
    { type: "chicken_statue", unlockCondition: "breed_all_chicken_tiers" },
  ])("accepts a valid Chicken Statue source variant", (source) => {
    const trackerData = {
      cosmetics: {},
      items: { reward: { sources: [source] } },
      recipes: {},
    };
    const references = AcquisitionReferenceIndex.from({ emitted: { items: trackerData.items } });

    expect(() => {
      validateAcquisitionSources(assembly(trackerData), references);
    }).not.toThrow();
  });

  it.each([
    { type: "chicken_statue" },
    { type: "chicken_statue", cost: 10, unlockCondition: "breed_all_chicken_tiers" },
    { type: "chicken_statue", unlockCondition: "unknown" },
  ])("rejects an invalid Chicken Statue source variant", (source) => {
    const trackerData = {
      cosmetics: {},
      items: { reward: { sources: [source] } },
      recipes: {},
    };
    const references = AcquisitionReferenceIndex.from({ emitted: { items: trackerData.items } });

    expect(() => {
      validateAcquisitionSources(assembly(trackerData), references);
    }).toThrow(AcquisitionSourceValidationError);
  });

  it("accepts an assembled fixture with emitted and non-emitted native references", () => {
    const trackerData = {
      almanac: {},
      cosmetics: { hat: { sources: [{ type: "default" }] } },
      items: {
        catch: {
          sources: [
            { type: "festival_activity", activityId: "contest", festivalId: "spring_festival" },
            { type: "station", stationId: "forge" },
            { type: "forage", locationIds: ["farm"] },
            { type: "fish", waterTypes: ["river"] },
            { type: "monster", monsterId: "slime" },
            { type: "quest", questId: "story_quest", trigger: "completion" },
          ],
        },
      },
      museum: {},
      recipes: { catch_recipe: { sources: [{ type: "default" }] } },
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: {
        cosmetics: trackerData.cosmetics,
        festivals: { spring_festival: {} },
        items: trackerData.items,
        quests: { story: { story_quest: { name: "Story quest" } } },
        recipes: trackerData.recipes,
      },
      native: {
        activities: ["contest"],
        locations: ["farm"],
        monsters: ["slime"],
        stations: ["forge"],
        waterTypes: ["river"],
      },
    });

    expect(() => {
      validateAcquisitionSources(assembly(trackerData), references);
    }).not.toThrow();
  });

  it("rejects a raw native quest group as questType", () => {
    const trackerData = {
      cosmetics: {},
      items: {
        scroll: {
          sources: [
            {
              type: "quest",
              questId: "story_quest",
              questType: "story_quests",
              trigger: "completion",
            },
          ],
        },
      },
      recipes: {},
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: { items: trackerData.items },
      native: { quests: ["story_quest"], questTypes: ["story"] },
    });

    expect(() => {
      validateAcquisitionSources(assembly(trackerData), references);
    }).toThrow('Unknown quest type ID "story_quests"');
  });

  it("validates branded references nested in availability conditions", () => {
    const trackerData = {
      cosmetics: {},
      items: {
        gated_item: {
          sources: [
            {
              type: "store",
              availability: { type: "heartLevel", level: 4, villagerId: "missing_villager" },
              storeId: "general",
            },
          ],
        },
      },
      recipes: {},
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: { items: trackerData.items, stores: { general: {} } },
    });

    expect(() => {
      validateAcquisitionSources(assembly(trackerData), references);
    }).toThrow('Unknown villager ID "missing_villager"');
  });

  it("rejects unexpected fields on every availability variant", () => {
    const conditions = [
      { type: "all", conditions: [] },
      { type: "any", conditions: [] },
      { type: "not", condition: { type: "always" } },
      { type: "always" },
      { type: "gamePredicate", predicate: "native_flag", value: true },
      { type: "heartLevel", level: 4, villagerId: "villager" },
      { type: "minesLevel", floor: 20 },
      { type: "perkUnlocked", perkId: "perk" },
      { type: "quest", questId: "quest", state: "completed" },
      { type: "season", seasons: ["spring"] },
      { type: "skillLevel", level: 8, skillId: "skill" },
      { type: "time", start: 600, end: 1200 },
      { type: "weather", weathers: ["calm"] },
    ];
    const items = Object.fromEntries(
      conditions.map((condition, index) => [
        `item_${String(index).padStart(2, "0")}`,
        {
          sources: [
            {
              type: "store",
              availability: { ...condition, extra: undefined },
              storeId: "general",
            },
          ],
        },
      ]),
    );
    const references = AcquisitionReferenceIndex.from({
      emitted: {
        items,
        perks: { perk: {} },
        quests: { quest: { name: "Quest" } },
        skills: { skill: {} },
        stores: { general: {} },
        villagers: { villager: {} },
      },
    });

    const diagnostics = captureDiagnostics({ cosmetics: {}, items, recipes: {} }, references);
    expect(diagnostics).toHaveLength(conditions.length);
    expect(diagnostics.map(({ fieldPath, message }) => ({ fieldPath, message }))).toEqual(
      conditions.map((condition, index) => ({
        fieldPath: `items.item_${String(index).padStart(2, "0")}.sources[0].availability.extra`,
        message: `Unexpected field for ${condition.type} availability`,
      })),
    );
  });

  it("rejects non-enumerable availability fields that disappear from JSON", () => {
    const availability: Record<string, unknown> = {};
    Object.defineProperty(availability, "type", { value: "always" });
    const items = {
      hidden_type: {
        sources: [{ type: "store", availability, storeId: "general" }],
      },
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: { items, stores: { general: {} } },
    });

    expect(captureDiagnostics({ cosmetics: {}, items, recipes: {} }, references)).toEqual([
      {
        fieldPath: "items.hidden_type.sources[0].availability.type",
        kind: "malformed-payload",
        message: "Expected an enumerable data property",
        targetId: "hidden_type",
      },
    ]);
  });

  it("rejects accessor-backed availability fields without executing getters", () => {
    let getterCalls = 0;
    const availability: Record<string, unknown> = {
      type: "gamePredicate",
      predicate: "native_flag",
    };
    Object.defineProperty(availability, "value", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return true;
      },
    });
    const items = {
      accessor_value: {
        sources: [{ type: "store", availability, storeId: "general" }],
      },
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: { items, stores: { general: {} } },
    });

    expect(captureDiagnostics({ cosmetics: {}, items, recipes: {} }, references)).toEqual([
      {
        fieldPath: "items.accessor_value.sources[0].availability.value",
        kind: "malformed-payload",
        message: "Expected a data property",
        targetId: "accessor_value",
      },
    ]);
    expect(getterCalls).toBe(0);
  });

  it("rejects null-prototype nested arrays with deterministic diagnostics", () => {
    const conditions: unknown[] = [{ type: "always" }];
    const predicateValue: unknown[] = [true];
    Object.setPrototypeOf(conditions, null);
    Object.setPrototypeOf(predicateValue, null);
    const items = {
      null_conditions: {
        sources: [
          {
            type: "store",
            availability: { type: "all", conditions },
            storeId: "general",
          },
        ],
      },
      null_predicate: {
        sources: [
          {
            type: "store",
            availability: {
              type: "gamePredicate",
              predicate: "native_flag",
              value: predicateValue,
            },
            storeId: "general",
          },
        ],
      },
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: { items, stores: { general: {} } },
    });

    expect(captureDiagnostics({ cosmetics: {}, items, recipes: {} }, references)).toEqual([
      {
        fieldPath: "items.null_conditions.sources[0].availability.conditions",
        kind: "malformed-payload",
        message: "Expected a dense JSON array of availability conditions",
        targetId: "null_conditions",
      },
      {
        fieldPath: "items.null_predicate.sources[0].availability.value",
        kind: "malformed-payload",
        message: "Expected a JSON value",
        targetId: "null_predicate",
      },
    ]);
  });

  it("rejects custom-prototype nested arrays without executing inherited methods", () => {
    const inheritedCalls = { every: 0, forEach: 0 };
    const customArrayPrototype = {};
    Object.setPrototypeOf(customArrayPrototype, Array.prototype);
    Object.defineProperties(customArrayPrototype, {
      every: {
        get() {
          inheritedCalls.every += 1;
          return Array.prototype.every;
        },
      },
      forEach: {
        get() {
          inheritedCalls.forEach += 1;
          return Array.prototype.forEach;
        },
      },
    });
    const conditions: unknown[] = [{ type: "always" }];
    const predicateValue: unknown[] = [true];
    Object.setPrototypeOf(conditions, customArrayPrototype);
    Object.setPrototypeOf(predicateValue, customArrayPrototype);
    const items = {
      custom_conditions: {
        sources: [
          {
            type: "store",
            availability: { type: "all", conditions },
            storeId: "general",
          },
        ],
      },
      custom_predicate: {
        sources: [
          {
            type: "store",
            availability: {
              type: "gamePredicate",
              predicate: "native_flag",
              value: predicateValue,
            },
            storeId: "general",
          },
        ],
      },
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: { items, stores: { general: {} } },
    });
    let validationError: unknown;
    try {
      validateAcquisitionSources(assembly({ items }), references);
    } catch (error) {
      validationError = error;
    }

    expect(inheritedCalls).toEqual({ every: 0, forEach: 0 });
    assert.instanceOf(validationError, AcquisitionSourceValidationError);
    expect(validationError.diagnostics).toEqual([
      {
        fieldPath: "items.custom_conditions.sources[0].availability.conditions",
        kind: "malformed-payload",
        message: "Expected a dense JSON array of availability conditions",
        targetId: "custom_conditions",
      },
      {
        fieldPath: "items.custom_predicate.sources[0].availability.value",
        kind: "malformed-payload",
        message: "Expected a JSON value",
        targetId: "custom_predicate",
      },
    ]);
  });

  it("rejects invalid season and weather members and non-JSON condition arrays", () => {
    const sparseConditions: unknown[] = [];
    sparseConditions.length = 1;
    const items = {
      invalid_array: {
        sources: [
          {
            type: "store",
            availability: { type: "all", conditions: sparseConditions },
            storeId: "general",
          },
        ],
      },
      invalid_season: {
        sources: [
          {
            type: "store",
            availability: { type: "season", seasons: ["monsoon"] },
            storeId: "general",
          },
        ],
      },
      invalid_weather: {
        sources: [
          {
            type: "store",
            availability: { type: "weather", weathers: ["sunny"] },
            storeId: "general",
          },
        ],
      },
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: { items, stores: { general: {} } },
    });

    expect(captureDiagnostics({ cosmetics: {}, items, recipes: {} }, references)).toEqual([
      {
        fieldPath: "items.invalid_array.sources[0].availability.conditions",
        kind: "malformed-payload",
        message: "Expected a dense JSON array of availability conditions",
        targetId: "invalid_array",
      },
      {
        fieldPath: "items.invalid_season.sources[0].availability.seasons[0]",
        kind: "malformed-payload",
        message: 'Unknown season "monsoon"',
        targetId: "invalid_season",
      },
      {
        fieldPath: "items.invalid_weather.sources[0].availability.weathers[0]",
        kind: "malformed-payload",
        message: 'Unknown weather "sunny"',
        targetId: "invalid_weather",
      },
    ]);
  });

  it("aggregates malformed recipe source collections without throwing a native error", () => {
    const recipes = { malformed_recipe: { sources: null } };
    const references = AcquisitionReferenceIndex.from({ emitted: { recipes } });

    expect(captureDiagnostics({ cosmetics: {}, items: {}, recipes }, references)).toEqual([
      {
        fieldPath: "recipes.malformed_recipe.sources",
        kind: "malformed-payload",
        message: "Expected an array of acquisition sources",
        targetId: "malformed_recipe",
      },
    ]);
  });

  it("keeps provenance entry-specific when one source object is reused", () => {
    const sharedSource = {
      type: "store",
      availability: { type: "gamePredicate", predicate: "native_flag", value: undefined },
      storeId: "general",
    } as unknown as Source;
    const items = new ItemSourceAccumulator();
    const cosmetics = new CosmeticSourceAccumulator();
    items.add("shared" as never, sharedSource, {
      fieldPath: "items.stock[0]",
      sourcePath: "fiddle/items.toml",
    });
    cosmetics.add("shared" as never, sharedSource, {
      fieldPath: "cosmetics.stock[0]",
      sourcePath: "fiddle/cosmetics.toml",
    });
    const trackerData = {
      cosmetics: { shared: { sources: cosmetics.get("shared" as never) } },
      items: { shared: { sources: items.get("shared" as never) } },
      recipes: {},
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: {
        cosmetics: trackerData.cosmetics,
        items: trackerData.items,
        stores: { general: {} },
      },
    });

    expect(
      captureDiagnostics(trackerData, references).map(
        ({ fieldPath, sourceFieldPath, sourcePath }) => ({
          fieldPath,
          sourceFieldPath,
          sourcePath,
        }),
      ),
    ).toEqual([
      {
        fieldPath: "cosmetics.shared.sources[0].availability.value",
        sourceFieldPath: "cosmetics.stock[0]",
        sourcePath: "fiddle/cosmetics.toml",
      },
      {
        fieldPath: "items.shared.sources[0].availability.value",
        sourceFieldPath: "items.stock[0]",
        sourcePath: "fiddle/items.toml",
      },
    ]);
  });

  it("emits missing-source for a recipe with no acquisition sources", () => {
    const trackerData = {
      almanac: {},
      cosmetics: {},
      items: {},
      museum: {},
      recipes: { orphan_recipe: { sources: [] } },
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: {
        cosmetics: trackerData.cosmetics,
        items: trackerData.items,
        recipes: trackerData.recipes,
      },
    });

    expect(captureDiagnostics(trackerData, references)).toEqual([
      {
        fieldPath: "recipes.orphan_recipe.sources",
        kind: "missing-source",
        message: 'Recipe "orphan_recipe" has no acquisition sources',
        targetId: "orphan_recipe",
      },
    ]);
  });

  it("aggregates deterministic diagnostics with field paths and source provenance", () => {
    const malformedSource = {
      type: "store",
      availability: { type: "gamePredicate", predicate: "native_flag", value: undefined },
      storeId: "general",
    } as unknown as Source;
    const accumulator = new ItemSourceAccumulator();
    accumulator.add("malformed" as never, malformedSource, {
      fieldPath: "shops.general.stock[2]",
      sourcePath: "fiddle/shops.toml",
    });

    const trackerData = {
      almanac: {},
      cosmetics: { empty_cosmetic: { sources: [] } },
      items: {
        excluded_reference: {
          sources: [{ type: "donate_item", triggerItemId: "debug_item" }],
        },
        malformed: { sources: accumulator.get("malformed" as never) },
        missing_item: { sources: [] },
      },
      museum: {},
      recipes: {
        cycle_a: {
          sources: [{ type: "recipe", method: "cook", recipeId: "cycle_b" }],
        },
        cycle_b: {
          sources: [{ type: "recipe", method: "cook", recipeId: "cycle_a" }],
        },
        unresolved: {
          sources: [{ type: "recipe", method: "cook", recipeId: "missing_recipe" }],
        },
      },
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: {
        cosmetics: trackerData.cosmetics,
        items: trackerData.items,
        recipes: trackerData.recipes,
        stores: { general: {} },
      },
      excluded: { items: ["debug_item"] },
    });

    expect(captureDiagnostics(trackerData, references)).toEqual([
      {
        fieldPath: "cosmetics.empty_cosmetic.sources",
        kind: "missing-source",
        message: 'Cosmetic "empty_cosmetic" has no acquisition sources',
        targetId: "empty_cosmetic",
      },
      {
        fieldPath: "items.missing_item.sources",
        kind: "missing-source",
        message: 'Item "missing_item" has no acquisition sources',
        targetId: "missing_item",
      },
      {
        fieldPath: "items.malformed.sources[0].availability.value",
        kind: "malformed-payload",
        message: "Expected a JSON value",
        sourceFieldPath: "shops.general.stock[2]",
        sourcePath: "fiddle/shops.toml",
        targetId: "malformed",
      },
      {
        fieldPath: "recipes.unresolved.sources[0].recipeId",
        kind: "unresolved-reference",
        message: 'Unknown recipe ID "missing_recipe"',
        targetId: "unresolved",
      },
      {
        fieldPath: "items.excluded_reference.sources[0].triggerItemId",
        kind: "excluded-id-reference",
        message: 'Excluded item ID "debug_item" is still referenced',
        targetId: "excluded_reference",
      },
      {
        fieldPath: "recipes.cycle_a.sources",
        kind: "recipe-cycle",
        message: "Recipe source cycle: cycle_a -> cycle_b -> cycle_a",
        targetId: "cycle_a",
      },
    ]);
  });

  it("validates fetch quest itemId references against emitted items", () => {
    const trackerData = {
      cosmetics: {},
      items: { wild_berries: { sources: [{ type: "default" }] } },
      quests: {
        fetch: {
          meet_juniper: { itemId: "nonexistent_item", sources: [], villager: "juniper" },
        },
      },
      recipes: {},
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: {
        cosmetics: trackerData.cosmetics,
        items: trackerData.items,
        recipes: trackerData.recipes,
      },
      native: { villagers: { juniper: {} } },
    });

    const diagnostics = captureDiagnostics(trackerData, references);
    expect(diagnostics).toContainEqual({
      fieldPath: "quests.fetch.meet_juniper.itemId",
      kind: "unresolved-reference",
      message: 'Unknown item ID "nonexistent_item"',
      targetId: "meet_juniper",
    });
  });

  it("validates fetch quest villager references against known Villagers", () => {
    const trackerData = {
      cosmetics: {},
      items: { wild_berries: { sources: [{ type: "default" }] } },
      quests: {
        fetch: {
          meet_juniper: {
            itemId: "wild_berries",
            sources: [],
            villager: "nonexistent_villager",
          },
        },
      },
      recipes: {},
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: {
        cosmetics: trackerData.cosmetics,
        items: trackerData.items,
        recipes: trackerData.recipes,
      },
    });

    const diagnostics = captureDiagnostics(trackerData, references);
    expect(diagnostics).toContainEqual({
      fieldPath: "quests.fetch.meet_juniper.villager",
      kind: "unresolved-reference",
      message: 'Unknown villager ID "nonexistent_villager"',
      targetId: "meet_juniper",
    });
  });

  it("accepts fetch quests with valid item and Villager references", () => {
    const trackerData = {
      cosmetics: {},
      items: { wild_berries: { sources: [{ type: "default" }] } },
      quests: {
        fetch: {
          meet_juniper: { itemId: "wild_berries", sources: [], villager: "juniper" },
        },
      },
      recipes: {},
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: {
        cosmetics: trackerData.cosmetics,
        items: trackerData.items,
        recipes: trackerData.recipes,
      },
      native: { quests: trackerData.quests, villagers: { juniper: {} } },
    });

    expect(() => {
      validateAcquisitionSources(assembly(trackerData), references);
    }).not.toThrow();
  });
});

/**
 * Completes a partial fixture with empty collections. Fixtures are deliberately loose: the
 * validator exists to reject payloads the `TrackerData` type cannot rule out at runtime.
 */
function assembly(partial: Record<string, unknown>): AcquisitionSourceAssembly {
  return {
    almanac: {},
    animals: {},
    categoryVisibility: {},
    cosmetics: {},
    items: {},
    mines: { biomes: [], spells: {} },
    museum: {},
    pets: { cosmetics: {}, skins: {} },
    quests: {},
    recipes: {},
    stores: {},
    villagers: {},
    ...partial,
  } as unknown as AcquisitionSourceAssembly;
}

function captureDiagnostics(
  trackerData: Record<string, unknown>,
  references: AcquisitionReferenceIndex,
): AcquisitionSourceValidationError["diagnostics"] {
  try {
    validateAcquisitionSources(assembly(trackerData), references);
    expect.unreachable("validation should fail");
  } catch (error) {
    assert.instanceOf(error, AcquisitionSourceValidationError);
    return error.diagnostics;
  }
}

describe("validateAcquisitionSources on assembled tracker data", () => {
  const references = AcquisitionReferenceIndex.from({
    emitted: {
      items: ["wild_berries", "honey"],
      recipes: ["berry_tart"],
    },
    native: {
      animals: ["chicken"],
      perks: ["mist_sight"],
      quests: ["repair_the_bridge", "the_water_tablet", "berry_quest", "tart_quest", "date_quest"],
      questTypes: ["cooking", "fetch", "heart", "story"],
      skills: ["foraging"],
      stores: ["darcy"],
      villagers: ["balor", "darcy"],
    },
  });

  it("accepts every collection in its real emitted shape", () => {
    expect(() => {
      validateAcquisitionSources(assembly(realShapes()), references);
    }).not.toThrow();
  });

  it.each([
    {
      expected: {
        fieldPath: "almanac.cooking.items[0].itemIds[0]",
        kind: "unresolved-reference",
        message: 'Unknown item ID "missing_item"',
      },
      name: "an unknown almanac item",
      path: ["almanac", "cooking", "items"],
      value: [{ itemIds: ["missing_item"], recipeId: "berry_tart" }],
    },
    {
      expected: {
        fieldPath: "almanac.cooking.items[0].recipeId",
        kind: "unresolved-reference",
        message: 'Unknown recipe ID "missing_recipe"',
      },
      name: "an unknown almanac recipe",
      path: ["almanac", "cooking", "items"],
      value: [{ itemIds: ["wild_berries"], recipeId: "missing_recipe" }],
    },
    {
      expected: {
        fieldPath: "almanac.cooking.items[0].itemIds[0]",
        kind: "malformed-payload",
        message: "Expected a string item ID",
      },
      name: "a non-string almanac item ID",
      path: ["almanac", "cooking", "items"],
      value: [{ itemIds: [7] }],
    },
    {
      expected: {
        fieldPath: "almanac.cooking.items[0]",
        kind: "malformed-payload",
        message: "Expected an object",
      },
      name: "the old string-array almanac shape",
      path: ["almanac", "cooking", "items"],
      value: ["wild_berries"],
    },
    {
      expected: {
        fieldPath: "almanac.forage.items[0].itemIds",
        kind: "malformed-payload",
        message: "Expected at least one ID",
      },
      name: "an almanac entry without members",
      path: ["almanac", "forage", "items"],
      value: [{ itemIds: [] }],
    },
    {
      expected: {
        fieldPath: "museum.flora.sets.berries.items[0]",
        kind: "unresolved-reference",
        message: 'Unknown item ID "missing_item"',
      },
      name: "an unknown museum item",
      path: ["museum", "flora", "sets", "berries", "items"],
      value: ["missing_item"],
    },
    {
      expected: {
        fieldPath: "quests.cooking.tart_quest.recipeId",
        kind: "malformed-payload",
        message: "Expected a value",
      },
      name: "a cooking quest without its recipe",
      path: ["quests", "cooking", "tart_quest"],
      value: { sources: [] },
    },
    {
      expected: {
        fieldPath: "quests.fetch.berry_quest.rewardRecipeId",
        kind: "unresolved-reference",
        message: 'Unknown recipe ID "missing_recipe"',
      },
      name: "an unknown fetch reward recipe",
      path: ["quests", "fetch", "berry_quest", "rewardRecipeId"],
      value: "missing_recipe",
    },
    {
      expected: {
        fieldPath: "quests.heart.date_quest.heartLevel",
        kind: "malformed-payload",
        message: "Expected a finite number",
      },
      name: "a heart quest without a numeric level",
      path: ["quests", "heart", "date_quest", "heartLevel"],
      value: "2",
    },
    {
      expected: {
        fieldPath: "quests.story.repair_the_bridge.heartLevelChanges[0].villagerId",
        kind: "unresolved-reference",
        message: 'Unknown villager ID "missing_villager"',
      },
      name: "an unknown heart-level-change villager",
      path: ["quests", "story", "repair_the_bridge", "heartLevelChanges"],
      value: [{ level: 1, villagerId: "missing_villager" }],
    },
    {
      expected: {
        fieldPath: "quests.side",
        kind: "malformed-payload",
        message: "Expected a known quest type",
      },
      name: "an unknown quest type",
      path: ["quests", "side"],
      value: {},
    },
    {
      expected: {
        fieldPath: "quests.story.made_up_quest",
        kind: "unresolved-reference",
        message: 'Unknown quest ID "made_up_quest"',
      },
      name: "an emitted quest the game does not define",
      path: ["quests", "story", "made_up_quest"],
      value: { sources: [] },
    },
    {
      expected: {
        fieldPath: "stores.darcy.visibility.questId",
        kind: "unresolved-reference",
        message: 'Unknown quest ID "repair_the_brigde"',
      },
      name: "a misspelled store unlock quest",
      path: ["stores", "darcy", "visibility"],
      value: { type: "questCompleted", questId: "repair_the_brigde" },
    },
    {
      expected: {
        fieldPath: "villagers.darcy.visibility.questId",
        kind: "unresolved-reference",
        message: 'Unknown quest ID "breaking_the_last_seal"',
      },
      name: "a misspelled villager gate",
      path: ["villagers", "darcy", "visibility"],
      value: { type: "questCompleted", questId: "breaking_the_last_seal" },
    },
    {
      expected: {
        fieldPath: "mines.spells.summon_rain.sources[0].questId",
        kind: "unresolved-reference",
        message: 'Unknown quest ID "the_watter_tablet"',
      },
      name: "an injected spell source with an unknown quest",
      path: ["mines", "spells", "summon_rain", "sources"],
      value: [
        { type: "quest", questId: "the_watter_tablet", questType: "story", trigger: "completion" },
      ],
    },
    {
      expected: {
        fieldPath: "animals.chicken.visibility.questId",
        kind: "unresolved-reference",
        message: 'Unknown quest ID "repair_haydens_barn"',
      },
      name: "an animal gate quest the game does not define",
      path: ["animals", "chicken", "visibility"],
      value: { type: "questCompleted", questId: "repair_haydens_barn" },
    },
    {
      expected: {
        fieldPath: "items.honey.sources[0].visibility.questId",
        kind: "unresolved-reference",
        message: 'Unknown quest ID "missing_quest"',
      },
      name: "an unknown quest in a source visibility",
      path: ["items", "honey", "sources"],
      value: [
        {
          type: "store",
          storeId: "darcy",
          visibility: { type: "questAvailable", questId: "missing_quest" },
        },
      ],
    },
    {
      expected: {
        fieldPath: "categoryVisibility.dates.conditions[0].villagerId",
        kind: "unresolved-reference",
        message: 'Unknown villager ID "missing_villager"',
      },
      name: "an unknown villager in category visibility",
      path: ["categoryVisibility", "dates"],
      value: {
        type: "or",
        conditions: [{ type: "heartLevel", level: 8, villagerId: "missing_villager" }],
      },
    },
    {
      expected: {
        fieldPath: "categoryVisibility.dates.conditions",
        kind: "malformed-payload",
        message: "Expected a non-empty array of visibility conditions",
      },
      name: "an empty visibility conjunction",
      path: ["categoryVisibility", "dates"],
      value: { type: "or", conditions: [] },
    },
    {
      expected: {
        fieldPath: "villagers.balor.visibility.type",
        kind: "malformed-payload",
        message: "Expected a known visibility type",
      },
      name: "an unknown visibility type",
      path: ["villagers", "balor", "visibility"],
      value: { type: "quest", questId: "repair_the_bridge" },
    },
    {
      expected: {
        fieldPath: "villagers.balor.visibility.state",
        kind: "malformed-payload",
        message: "Unexpected field for questCompleted visibility",
      },
      name: "an unexpected visibility field",
      path: ["villagers", "balor", "visibility"],
      value: { type: "questCompleted", questId: "repair_the_bridge", state: "completed" },
    },
    {
      expected: {
        fieldPath: "pets.skins.sapling.sources[0].monsterId",
        kind: "unresolved-reference",
        message: 'Unknown monster ID "sapling"',
      },
      name: "an unknown pet skin monster",
      path: ["pets", "skins", "sapling", "sources"],
      value: [{ type: "monster", monsterId: "sapling" }],
    },
  ])("reports $name", ({ expected, path, value }) => {
    expect(captureDiagnostics(withPatch(path, value), references)).toEqual([
      { ...expected, targetId: expect.any(String) },
    ]);
  });
});

/** One of every collection the validator walks, in the shapes the extractors emit. */
function realShapes(): Record<string, unknown> {
  return {
    almanac: {
      cooking: { items: [{ itemIds: ["wild_berries"], recipeId: "berry_tart" }] },
      forage: { items: [{ itemIds: ["honey"] }] },
    },
    animals: {
      chicken: {
        cosmetics: { egg_hat: { sources: [{ type: "store", storeId: "darcy" }] } },
        visibility: { type: "questCompleted", questId: "repair_the_bridge" },
      },
    },
    categoryVisibility: {
      dates: { type: "or", conditions: [{ type: "heartLevel", level: 8, villagerId: "balor" }] },
    },
    items: {
      honey: {
        sources: [
          {
            type: "store",
            storeId: "darcy",
            visibility: { type: "questAvailable", questId: "repair_the_bridge" },
          },
        ],
        visibility: { type: "questCompleted", questId: "repair_the_bridge" },
      },
      wild_berries: { sources: [{ type: "default" }] },
    },
    mines: {
      biomes: [],
      spells: {
        full_restore: { sources: [] },
        summon_rain: {
          sources: [
            {
              type: "quest",
              questId: "the_water_tablet",
              questType: "story",
              trigger: "completion",
            },
          ],
          visibility: { type: "questCompleted", questId: "the_water_tablet" },
        },
      },
    },
    museum: { flora: { sets: { berries: { items: ["wild_berries"] } } } },
    pets: {
      cosmetics: { halo: { sources: [{ type: "store", storeId: "darcy" }] } },
      skins: { sapling: { sources: [{ type: "default" }] } },
    },
    quests: {
      cooking: { tart_quest: { recipeId: "berry_tart", sources: [] } },
      fetch: {
        berry_quest: {
          itemId: "wild_berries",
          rewardRecipeId: "berry_tart",
          sources: [],
          villager: "balor",
        },
      },
      heart: {
        date_quest: {
          heartLevel: 2,
          sources: [],
          villager: "balor",
          visibility: {
            type: "and",
            conditions: [
              { type: "villagerKnown", villagerId: "balor" },
              { type: "perkUnlocked", perkId: "mist_sight" },
              { type: "skillLevel", level: 5, skillId: "foraging" },
            ],
          },
        },
      },
      story: {
        repair_the_bridge: {
          heartLevelChanges: [{ level: 1, villagerId: "darcy" }],
          sources: [],
        },
      },
    },
    recipes: { berry_tart: { sources: [{ type: "default" }] } },
    stores: { darcy: { visibility: { type: "questCompleted", questId: "repair_the_bridge" } } },
    villagers: {
      balor: {},
      darcy: { visibility: { type: "questCompleted", questId: "repair_the_bridge" } },
    },
  };
}

function withPatch(
  path: readonly string[],
  value: unknown,
  base: Record<string, unknown> = realShapes(),
): Record<string, unknown> {
  let target = base;
  for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
  const field = path.at(-1);
  if (field === undefined) throw new Error("withPatch needs a non-empty path");
  target[field] = value;
  return base;
}
