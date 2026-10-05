import { assert, describe, expect, it } from "vitest";

import { recordEntries } from "#lib/utils.js";

import { makeFiddle } from "../test-helpers.js";
import {
  applyReviewedOverrides,
  collectDefaultCosmeticSources,
  collectDefaultItemSources,
  COSMETIC_OVERRIDES,
  ITEM_OVERRIDES,
  ITEM_SOURCE_REPLACEMENTS,
} from "./reviewed-overrides.js";
import { CosmeticSourceAccumulator, ItemSourceAccumulator } from "./source-accumulator.js";

import type { Source } from "#lib/types/acquisition.js";
import type { CosmeticId, ItemId, QuestId, QuestType, StoreId } from "#lib/types/tracker-data.js";

describe("reviewed overrides", () => {
  describe("override tables", () => {
    it("adds explicit story metadata only to runtime-only reviewed quest IDs", () => {
      const runtimeOnlyQuestIds = new Set<QuestId>([
        "another_tower" as QuestId,
        "balors_crate" as QuestId,
        "beach_date_unlock" as QuestId,
        "break_earth_seal" as QuestId,
        "break_fire_seal" as QuestId,
        "break_ruins_seal_pt_3" as QuestId,
        "break_water_seal" as QuestId,
        "elsies_dating_tutorial" as QuestId,
        "gem_cutting_date_unlock" as QuestId,
        "great_bird_0" as QuestId,
        "park_date_unlock" as QuestId,
        "ryis_lumber" as QuestId,
      ]);
      const questTypes = new Set<QuestType>([
        "cooking",
        "crown",
        "fetch",
        "heart",
        "mission",
        "story",
      ]);

      for (const sources of Object.values(ITEM_OVERRIDES)) {
        for (const source of sources ?? []) {
          if (source.type !== "quest") continue;
          expect(source.questType === undefined || questTypes.has(source.questType)).toBe(true);
          expect(source.questType, source.questId).toBe(
            runtimeOnlyQuestIds.has(source.questId) ? "story" : undefined,
          );
        }
      }
    });

    it("every item override has a target ID and at least one source", () => {
      for (const [targetId, sources] of recordEntries(ITEM_OVERRIDES)) {
        expect(targetId).toBeTruthy();
        expect(sources.length).toBeGreaterThan(0);
        for (const source of sources) {
          expect(source.type).toBeTruthy();
        }
      }
    });

    it("records the Big Egg as the one-time all-chicken-tiers reward", () => {
      expect(ITEM_OVERRIDES["big_egg" as ItemId]).toEqual([
        { type: "chicken_statue", unlockCondition: "breed_all_chicken_tiers" },
      ]);
    });

    it("replaces Void Herb with quest-gated foraging throughout the Mines", () => {
      expect(ITEM_SOURCE_REPLACEMENTS["void_herb" as ItemId]).toEqual([
        {
          type: "forage",
          availability: {
            type: "quest",
            questId: "find_the_magic_key",
            state: "completed",
          },
          locationIds: ["mines"],
        },
      ]);
    });

    it.each([
      [
        "big_cookie",
        [{ type: "quest", questId: "a_rewarding_choice", trigger: "dialogue_choice" }],
      ],
      [
        "maples_drawing",
        [
          {
            type: "quest",
            questId: "the_aldarian_cooking_contest",
            trigger: "completion",
          },
        ],
      ],
    ] as const)("replaces %s with its reviewed runtime source", (itemId, expected) => {
      expect(ITEM_SOURCE_REPLACEMENTS[itemId as ItemId]).toEqual(expected);
    });

    it("every cosmetic override has a target ID and at least one source", () => {
      for (const [targetId, sources] of recordEntries(COSMETIC_OVERRIDES)) {
        expect(targetId).toBeTruthy();
        expect(sources.length).toBeGreaterThan(0);
        for (const source of sources) {
          expect(source.type).toBeTruthy();
        }
      }
    });

    it("void_cake has a quest dialogue_choice source from the_dragonsworn_tablet", () => {
      const sources = ITEM_OVERRIDES["void_cake" as ItemId];
      assert(sources);
      expect(sources).toHaveLength(1);
      const source = sources[0] as Extract<Source, { type: "quest" }>;
      expect(source.type).toBe("quest");
      expect(source.trigger).toBe("dialogue_choice");
      expect(source.questId).toBe("the_dragonsworn_tablet");
    });

    it("dingy set items have lost_and_found sources gated behind quest completion", () => {
      const dingyIds = [
        "dingy_flooring_v1",
        "dingy_rug_v1",
        "dingy_table_v1",
        "dingy_chair_v1",
        "dingy_couch_v1",
        "dingy_window_v1",
        "dingy_string_lights_v1",
        "dingy_broken_plate_v1",
        "dingy_broken_bottle_v1",
        "dingy_chipped_cup_v1",
        "dingy_pile_of_newspapers_v1",
        "dingy_pile_of_laundry_v1",
        "dingy_garbage_bag_v1",
        "dingy_mouse_hole_v1",
        "dingy_wallpaper_v1",
      ] as ItemId[];

      for (const id of dingyIds) {
        const sources = ITEM_OVERRIDES[id];
        assert(sources);
        expect(sources).toHaveLength(1);
        const source = sources[0] as Extract<Source, { type: "lost_and_found" }>;
        expect(source.type).toBe("lost_and_found");
        expect(source.visibility).toEqual({
          type: "questCompleted",
          questId: "lost_and_found",
        });
      }
    });

    it("Dragon Cleric cosmetics are ritual_chamber sources with lost_to_history perk", () => {
      const expectedIds = [
        "back_gear_dragon_cleric_cape",
        "face_gear_dragon_cleric_earrings",
        "head_dragon_cleric_diadem",
        "robe_dragon_cleric",
        "shoes_boots_dragon_cleric",
      ] as CosmeticId[];

      for (const id of expectedIds) {
        const sources = COSMETIC_OVERRIDES[id];
        assert(sources);
        expect(sources).toHaveLength(1);
        const source = sources[0] as Extract<Source, { type: "ritual_chamber" }>;
        expect(source.type).toBe("ritual_chamber");
        expect(source.perkId).toBe("lost_to_history");
      }
    });
  });

  describe("applyReviewedOverrides", () => {
    it("replaces Void Herb native sources while leaving other targets intact", () => {
      const items = new ItemSourceAccumulator();
      const cosmetics = new CosmeticSourceAccumulator();
      items.add("void_herb" as ItemId, {
        type: "mine",
        biomeId: "ancient_ruins" as never,
      });
      items.add("other_item" as ItemId, { type: "default" });

      applyReviewedOverrides({ other_item: {}, void_herb: {} }, {}, items, cosmetics);

      expect(items.get("void_herb" as ItemId)).toEqual(
        ITEM_SOURCE_REPLACEMENTS["void_herb" as ItemId],
      );
      expect(items.get("other_item" as ItemId)).toEqual([{ type: "default" }]);
    });

    it("adds overrides to accumulators for targets that exist in registries", () => {
      const itemAdds: [ItemId, Source][] = [];
      const cosmeticAdds: [CosmeticId, Source][] = [];

      const itemAccumulator = {
        add: (id: ItemId, source: Source) => itemAdds.push([id, source]),
        get: () => [],
      } as unknown as ItemSourceAccumulator;

      const cosmeticAccumulator = {
        add: (id: CosmeticId, source: Source) => cosmeticAdds.push([id, source]),
        get: () => [],
      } as unknown as CosmeticSourceAccumulator;

      const items = { void_cake: { name: "Void Cake" } } as Record<string, unknown>;
      const cosmetics = {
        back_gear_dragon_cleric_cape: { name: "Dragon Cleric Cape" },
        face_gear_dragon_cleric_earrings: { name: "Dragon Cleric Earrings" },
        head_dragon_cleric_diadem: { name: "Dragon Cleric Diadem" },
        head_mimic_hat: { name: "Mimic Hat" },
        head_soup_pot: { name: "Soup Pot Hat" },
        head_teapot: { name: "Teapot Hat" },
        robe_dragon_cleric: { name: "Dragon Cleric Robes" },
        shoes_boots_dragon_cleric: { name: "Dragon Cleric Boots" },
      } as Record<string, unknown>;

      const diagnostics = applyReviewedOverrides(
        items,
        cosmetics,
        itemAccumulator,
        cosmeticAccumulator,
      );

      const missingTargetDiags = diagnostics.filter((d) => d.kind === "missing-target");
      const obsoleteDiags = diagnostics.filter((d) => d.kind === "obsolete-override");
      expect(obsoleteDiags).toHaveLength(0);
      expect(missingTargetDiags.every((d) => d.namespace === "items")).toBe(true);

      const voidCakeAdd = itemAdds.find(([id]) => id === ("void_cake" as ItemId));
      expect(voidCakeAdd).toBeDefined();
      expect(cosmeticAdds).toHaveLength(8);
    });

    it("reports diagnostics for override targets missing from registries", () => {
      const itemAccumulator = {
        add: () => undefined,
        get: () => [],
      } as unknown as ItemSourceAccumulator;

      const cosmeticAccumulator = {
        add: () => undefined,
        get: () => [],
      } as unknown as CosmeticSourceAccumulator;

      const diagnostics = applyReviewedOverrides({}, {}, itemAccumulator, cosmeticAccumulator);

      expect(diagnostics.length).toBeGreaterThan(0);
      for (const d of diagnostics) {
        expect(d.kind).toBe("missing-target");
        expect(d.targetId).toBeTruthy();
      }
    });

    it("skips override sources already present in accumulator with identical identity", () => {
      const void_cake = "void_cake" as ItemId;
      const itemAdds: [ItemId, Source][] = [];
      const itemAccumulator = {
        add: (id: ItemId, source: Source) => itemAdds.push([id, source]),
        get: (id: ItemId) => {
          if (id === void_cake) {
            return ITEM_OVERRIDES[void_cake];
          }
          return [];
        },
      } as unknown as ItemSourceAccumulator;

      const cosmeticAccumulator = {
        add: () => undefined,
        get: () => [],
      } as unknown as CosmeticSourceAccumulator;

      const items = { void_cake: { name: "Void Cake" } } as Record<string, unknown>;

      const diagnostics = applyReviewedOverrides(items, {}, itemAccumulator, cosmeticAccumulator);

      const obsoleteDiags = diagnostics.filter((d) => d.kind === "obsolete-override");
      expect(obsoleteDiags.length).toBeGreaterThan(0);
      expect(obsoleteDiags[0].targetId).toBe("void_cake");
    });

    it("coexists when native and override paths are distinct", () => {
      const void_cake = "void_cake" as ItemId;
      const itemAdds: [ItemId, Source][] = [];
      const itemAccumulator = {
        add: (id: ItemId, source: Source) => itemAdds.push([id, source]),
        get: (id: ItemId): Source[] => {
          if (id === void_cake) {
            return [{ type: "store", storeId: "some_store" as StoreId }];
          }
          return [];
        },
      } as unknown as ItemSourceAccumulator;

      const cosmeticAccumulator = {
        add: () => undefined,
        get: () => [],
      } as unknown as CosmeticSourceAccumulator;

      const items = { void_cake: { name: "Void Cake" } } as Record<string, unknown>;

      const diagnostics = applyReviewedOverrides(items, {}, itemAccumulator, cosmeticAccumulator);

      const obsoleteDiags = diagnostics.filter((d) => d.kind === "obsolete-override");
      expect(obsoleteDiags).toHaveLength(0);

      const voidCakeAdds = itemAdds.filter(([id]) => id === void_cake);
      expect(voidCakeAdds).toHaveLength(1);
    });
  });

  describe("collectDefaultCosmeticSources", () => {
    it("adds default sources for cosmetics with default source", () => {
      const adds: [CosmeticId, Source][] = [];
      const accumulator = {
        add: (id: CosmeticId, source: Source) => adds.push([id, source]),
      } as unknown as CosmeticSourceAccumulator;

      const cosmetics = {
        default_hat: { name: "Default Hat", slot: "head" as const, sources: [{ type: "default" }] },
        store_hat: { name: "Store Hat", slot: "head" as const, sources: [] },
      };

      collectDefaultCosmeticSources(cosmetics, accumulator);

      expect(adds).toHaveLength(1);
      expect(adds[0][0]).toBe("default_hat");
      expect(adds[0][1]).toEqual({ type: "default" });
    });

    it("does not add default for cosmetics without default source", () => {
      const adds: [CosmeticId, Source][] = [];
      const accumulator = {
        add: (id: CosmeticId, source: Source) => adds.push([id, source]),
      } as unknown as CosmeticSourceAccumulator;

      const cosmetics = {
        store_hat: { name: "Store Hat", slot: "head" as const, sources: [] },
      };

      collectDefaultCosmeticSources(cosmetics, accumulator);
      expect(adds).toHaveLength(0);
    });
  });

  describe("collectDefaultItemSources", () => {
    it("adds default sources for starting inventory items", () => {
      const adds: [ItemId, Source][] = [];
      const accumulator = {
        add: (id: ItemId, source: Source) => adds.push([id, source]),
      } as unknown as ItemSourceAccumulator;

      const fiddle = makeFiddle({
        misc: {
          ari_stats: {
            starting_inventory: ["sword_worn"],
          },
        },
      });

      const items = { sword_worn: { name: "Worn Sword" } };
      collectDefaultItemSources(fiddle, accumulator, items);

      expect(adds).toHaveLength(1);
      expect(adds[0][0]).toBe("sword_worn");
      expect(adds[0][1]).toEqual({ type: "default" });
    });

    it("adds default sources for starting armor items", () => {
      const adds: [ItemId, Source][] = [];
      const accumulator = {
        add: (id: ItemId, source: Source) => adds.push([id, source]),
      } as unknown as ItemSourceAccumulator;

      const fiddle = makeFiddle({
        misc: {
          ari_stats: {
            starting_armor: {
              boots: "cloth_shoes",
              chest: "cloth_chestpiece",
              head: "cloth_helmet",
            },
          },
        },
      });

      const items = {
        cloth_chestpiece: { name: "Cloth Chestpiece" },
        cloth_helmet: { name: "Cloth Helmet" },
        cloth_shoes: { name: "Cloth Shoes" },
      };

      collectDefaultItemSources(fiddle, accumulator, items);

      expect(adds).toHaveLength(3);
      const ids = adds.map(([id]) => id).toSorted();
      expect(ids).toEqual(["cloth_chestpiece", "cloth_helmet", "cloth_shoes"]);
    });

    it("skips starting items not in the item registry", () => {
      const adds: [ItemId, Source][] = [];
      const accumulator = {
        add: (id: ItemId, source: Source) => adds.push([id, source]),
      } as unknown as ItemSourceAccumulator;

      const fiddle = makeFiddle({
        misc: {
          ari_stats: {
            starting_inventory: ["nonexistent_item"],
          },
        },
      });

      collectDefaultItemSources(fiddle, accumulator, {});
      expect(adds).toHaveLength(0);
    });
  });
});
