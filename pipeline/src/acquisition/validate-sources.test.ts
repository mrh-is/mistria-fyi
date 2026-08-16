import { describe, expect, it } from "vitest";

import { AcquisitionReferenceIndex } from "./reference-index.js";
import { CosmeticSourceAccumulator, ItemSourceAccumulator } from "./source-accumulator.js";
import {
  AcquisitionSourceValidationError,
  validateAcquisitionSources,
} from "./validate-sources.js";

import type { Source } from "$lib/types/acquisition.js";

describe("validateAcquisitionSources", () => {
  it("accepts an assembled fixture with emitted and non-emitted native references", () => {
    const trackerData = {
      almanac: [],
      cosmetics: { hat: { sources: [{ type: "default" }] } },
      items: {
        catch: {
          sources: [
            { activityId: "contest", festivalId: "spring_festival", type: "festival_activity" },
            { stationId: "forge", type: "station" },
            { locationIds: ["farm"], type: "forage" },
            { type: "fish", waterTypes: ["river"] },
            { monsterId: "slime", type: "monster" },
            { questId: "story_quest", trigger: "completion", type: "quest" },
          ],
        },
      },
      museum: [],
      recipes: { catch_recipe: { memberItemIds: ["catch"], sources: [{ type: "default" }] } },
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
      validateAcquisitionSources(trackerData, references);
    }).not.toThrow();
  });

  it("validates branded references nested in availability conditions", () => {
    const trackerData = {
      cosmetics: {},
      items: {
        gated_item: {
          sources: [
            {
              availability: { level: 4, npcId: "missing_npc", type: "heartLevel" },
              storeId: "general",
              type: "store",
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
      validateAcquisitionSources(trackerData, references);
    }).toThrow('Unknown npc ID "missing_npc"');
  });

  it("rejects unexpected fields on every availability variant", () => {
    const conditions = [
      { conditions: [], type: "all" },
      { conditions: [], type: "any" },
      { condition: { type: "always" }, type: "not" },
      { type: "always" },
      { predicate: "native_flag", type: "gamePredicate", value: true },
      { level: 4, npcId: "npc", type: "heartLevel" },
      { floor: 20, type: "minesLevel" },
      { perkId: "perk", type: "perkUnlocked" },
      { questId: "quest", state: "completed", type: "quest" },
      { seasons: ["spring"], type: "season" },
      { level: 8, skillId: "skill", type: "skillLevel" },
      { start: 600, end: 1200, type: "time" },
      { type: "weather", weathers: ["calm"] },
    ];
    const items = Object.fromEntries(
      conditions.map((condition, index) => [
        `item_${String(index).padStart(2, "0")}`,
        {
          sources: [
            {
              availability: { ...condition, extra: undefined },
              storeId: "general",
              type: "store",
            },
          ],
        },
      ]),
    );
    const references = AcquisitionReferenceIndex.from({
      emitted: {
        items,
        npcs: { npc: {} },
        perks: { perk: {} },
        quests: { quest: { name: "Quest" } },
        skills: { skill: {} },
        stores: { general: {} },
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
        sources: [{ availability, storeId: "general", type: "store" }],
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
      predicate: "native_flag",
      type: "gamePredicate",
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
        sources: [{ availability, storeId: "general", type: "store" }],
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
            availability: { conditions, type: "all" },
            storeId: "general",
            type: "store",
          },
        ],
      },
      null_predicate: {
        sources: [
          {
            availability: {
              predicate: "native_flag",
              type: "gamePredicate",
              value: predicateValue,
            },
            storeId: "general",
            type: "store",
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
            availability: { conditions, type: "all" },
            storeId: "general",
            type: "store",
          },
        ],
      },
      custom_predicate: {
        sources: [
          {
            availability: {
              predicate: "native_flag",
              type: "gamePredicate",
              value: predicateValue,
            },
            storeId: "general",
            type: "store",
          },
        ],
      },
    };
    const references = AcquisitionReferenceIndex.from({
      emitted: { items, stores: { general: {} } },
    });
    let validationError: unknown;
    try {
      validateAcquisitionSources({ cosmetics: {}, items, recipes: {} }, references);
    } catch (error) {
      validationError = error;
    }

    expect(inheritedCalls).toEqual({ every: 0, forEach: 0 });
    expect(validationError).toBeInstanceOf(AcquisitionSourceValidationError);
    expect((validationError as AcquisitionSourceValidationError).diagnostics).toEqual([
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
    const sparseConditions = Array(1) as unknown[];
    const items = {
      invalid_array: {
        sources: [
          {
            availability: { conditions: sparseConditions, type: "all" },
            storeId: "general",
            type: "store",
          },
        ],
      },
      invalid_season: {
        sources: [
          {
            availability: { seasons: ["monsoon"], type: "season" },
            storeId: "general",
            type: "store",
          },
        ],
      },
      invalid_weather: {
        sources: [
          {
            availability: { type: "weather", weathers: ["sunny"] },
            storeId: "general",
            type: "store",
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
    const recipes = { malformed_recipe: { memberItemIds: [], sources: null } };
    const references = AcquisitionReferenceIndex.from({ emitted: { recipes } });

    expect(
      captureDiagnostics({ cosmetics: {}, items: {}, recipes: recipes as never }, references),
    ).toEqual([
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
      availability: { predicate: "native_flag", type: "gamePredicate", value: undefined },
      storeId: "general",
      type: "store",
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

  it("aggregates deterministic diagnostics with field paths and source provenance", () => {
    const malformedSource = {
      availability: { predicate: "native_flag", type: "gamePredicate", value: undefined },
      storeId: "general",
      type: "store",
    } as unknown as Source;
    const accumulator = new ItemSourceAccumulator();
    accumulator.add("malformed" as never, malformedSource, {
      fieldPath: "shops.general.stock[2]",
      sourcePath: "fiddle/shops.toml",
    });

    const trackerData = {
      almanac: [],
      cosmetics: { empty_cosmetic: { sources: [] } },
      items: {
        excluded_reference: {
          sources: [{ trigger: "donated_item", triggerItemId: "debug_item", type: "letter" }],
        },
        malformed: { sources: accumulator.get("malformed" as never) },
        missing_item: { sources: [] },
      },
      museum: [],
      recipes: {
        cycle_a: {
          memberItemIds: [],
          sources: [{ method: "cook", recipeId: "cycle_b", type: "recipe" }],
        },
        cycle_b: {
          memberItemIds: [],
          sources: [{ method: "cook", recipeId: "cycle_a", type: "recipe" }],
        },
        unresolved: {
          memberItemIds: [],
          sources: [{ method: "cook", recipeId: "missing_recipe", type: "recipe" }],
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

    try {
      validateAcquisitionSources(trackerData, references);
      expect.unreachable("validation should fail");
    } catch (error) {
      expect(error).toBeInstanceOf(AcquisitionSourceValidationError);
      expect((error as AcquisitionSourceValidationError).diagnostics).toEqual([
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
    }
  });
});

function captureDiagnostics(
  trackerData: Parameters<typeof validateAcquisitionSources>[0],
  references: AcquisitionReferenceIndex,
): AcquisitionSourceValidationError["diagnostics"] {
  try {
    validateAcquisitionSources(trackerData, references);
    expect.unreachable("validation should fail");
  } catch (error) {
    expect(error).toBeInstanceOf(AcquisitionSourceValidationError);
    return (error as AcquisitionSourceValidationError).diagnostics;
  }
}
