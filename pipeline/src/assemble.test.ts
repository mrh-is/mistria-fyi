import { beforeEach, describe, expect, it, vi } from "vitest";

import { assembleTrackerData } from "./assemble.js";
import { APP_UI_STRINGS } from "./localize/ui-strings.js";
import { createMemoryLocalizer, makeFiddle } from "./test-helpers.js";

import type { Source } from "#lib/types/acquisition.js";
import type { ItemId, QuestId, VillagerId } from "#lib/types/tracker-data.js";

import type { AssembleOptions } from "./assemble.js";

const turnip = "turnip" as ItemId;

const miscLocal = Object.fromEntries(
  APP_UI_STRINGS.map((request) =>
    typeof request === "string" ? [request, request] : [request.miscLocalKey, `The ${request.id}`],
  ),
);

/**
 * The smallest fiddle that passes every extractor & validation: tables the reference index
 * requires, the villagers & quests that hard-coded visibility rules name, one almanac item, and
 * every app UI string.
 */
function syntheticFiddle() {
  return makeFiddle({
    cutscenes: {},
    dates: {},
    dungeons: { dungeons: { biomes: [] }, misc: { max_floors: 10 } },
    fish: {},
    fishing: { chest_tables: {} },
    items: {
      crops: {
        vegetables: {
          turnip: { icon_sprite: "spr_ui_item_turnip", name: "Turnip", tags: ["crop"] },
        },
      },
    },
    locations: {},
    misc: {
      ari_stats: { starting_inventory: ["turnip"] },
      chicken_statue: { high_price: 2, low_price: 1 },
      wishing_well: { high_price: 2, low_price: 1 },
    },
    misc_local: { ...miscLocal, crops: "Crops" },
    monsters: {},
    npcs: {
      adeline: {
        birthday: { day: 3, season: "spring" },
        icon_sprite: "spr_ui_generic_icon_npc_adeline",
        name: "Adeline",
      },
      // Category visibility hard-codes the cooking & mission quest givers.
      stillwell: {
        birthday: { day: 7, season: "fall" },
        icon_sprite: "spr_ui_generic_icon_npc_stillwell",
        name: "Stillwell",
      },
      taliferro: {
        birthday: { day: 12, season: "winter" },
        icon_sprite: "spr_ui_generic_icon_npc_taliferro",
        name: "Taliferro",
      },
    },
    object_prototypes: {},
    pets: { variants: {} },
    quests: {
      heart_quests: {
        adeline_pregnancy_request: {
          name: "A Craving",
          stages: [{ queries: [{ npc: "adeline" }] }],
        },
      },
      // Villager visibility hard-codes the market upgrades that bring these villagers to town.
      story_quests: {
        upgrade_the_saturday_market: { name: "Upgrade the Saturday Market" },
        upgrade_the_saturday_market_plaza: { name: "Upgrade the Saturday Market Plaza" },
      },
    },
    ui: {
      character_customization: {},
      menus: { sub_menus: { almanac: { categories: [{ key: "crops", tags: ["crop"] }] } } },
    },
  });
}

const localizer = createMemoryLocalizer({
  translations: { jpn: { "npcs/adeline/name": "アデリン" } },
});

const options: AssembleOptions = {
  reviewedDiagnostics: [],
  reviewedOverrides: { cosmetics: {}, itemReplacements: {}, items: {} },
  version: "1.0.0",
};

beforeEach(() => {
  vi.spyOn(console, "log").mockReturnValue(undefined);
  return () => {
    vi.restoreAllMocks();
  };
});

describe("assembleTrackerData", () => {
  it("assembles a synthetic fiddle into validated tracker data", () => {
    const { iconSpritesByItemId, iconSpritesByVillagerId, trackerData } = assembleTrackerData(
      syntheticFiddle(),
      localizer,
      options,
    );

    expect(trackerData.version).toBe("1.0.0");
    expect(trackerData.items[turnip]).toEqual({
      category: "crops",
      sources: [{ type: "default" }],
    });
    expect(trackerData.almanac).toEqual({ crops: { items: [{ itemIds: ["turnip"] }] } });
    expect(trackerData.pregnancyQuestByVillager).toEqual({ adeline: "adeline_pregnancy_request" });
    expect(trackerData.quests.heart["adeline_pregnancy_request" as QuestId]).toEqual({
      heartLevel: 10,
      sources: [],
      villager: "adeline",
    });
    expect(trackerData.villagers["taliferro" as VillagerId]?.visibility).toEqual({
      type: "questCompleted",
      questId: "upgrade_the_saturday_market",
    });
    expect(trackerData.categoryVisibility.cooking).toEqual({
      type: "villagerKnown",
      villagerId: "taliferro",
    });
    expect(iconSpritesByItemId).toEqual({ turnip: "spr_ui_item_turnip" });
    expect(Object.keys(iconSpritesByVillagerId)).toEqual(["adeline", "stillwell", "taliferro"]);
  });

  it("localizes chunks through the injected localizer, in staging order", () => {
    const { localeChunks } = assembleTrackerData(syntheticFiddle(), localizer, options);

    expect(localeChunks.map((chunk) => chunk.category)).toEqual([
      "villagers",
      "dates",
      "festivals",
      "museum_wings",
      "perks",
      "pets/cosmetic_sets",
      "quests",
      "skills",
      "spells",
      "stores",
      "animals",
      "cosmetics",
      "cosmetics/subcategories",
      "ui",
      "mines",
      "town-ranks",
      "items",
      "recipes",
      "pets/skins",
      "treasure-chest-tiers",
      "locations",
    ]);
    const villagers = localeChunks.find((chunk) => chunk.category === "villagers");
    expect(villagers?.byLocale.ja.adeline).toBe("アデリン");
    expect(villagers?.byLocale.fr.adeline).toBe("Adeline");
    expect(localeChunks.find((chunk) => chunk.category === "items")?.byLocale.en).toEqual({
      turnip: "Turnip",
    });
  });

  it("merges reviewed overrides with native sources", () => {
    const wishingWell: Source = { type: "wishing_well", cost: 100 };

    const { trackerData } = assembleTrackerData(syntheticFiddle(), localizer, {
      ...options,
      reviewedOverrides: {
        cosmetics: {},
        itemReplacements: {},
        items: { [turnip]: [wishingWell] },
      },
    });

    expect(trackerData.items[turnip]?.sources).toEqual([wishingWell, { type: "default" }]);
  });

  it("fails instead of returning data when a reviewed override has no target", () => {
    expect(() =>
      assembleTrackerData(syntheticFiddle(), localizer, {
        ...options,
        reviewedOverrides: {
          cosmetics: {},
          itemReplacements: {},
          items: { ["missing_item" as ItemId]: [{ type: "default" }] },
        },
      }),
    ).toThrow(/missing-target at items\.missing_item/);
  });

  it("fails instead of emitting an item with no acquisition sources", () => {
    const fiddle = syntheticFiddle();
    (fiddle.misc as { ari_stats: { starting_inventory: string[] } }).ari_stats.starting_inventory =
      [];

    expect(() => assembleTrackerData(fiddle, localizer, options)).toThrow(
      "items.turnip has no acquisition sources",
    );
  });

  it("defaults to the installed game's reviewed overrides & diagnostics", () => {
    const {
      reviewedDiagnostics: _diagnostics,
      reviewedOverrides: _overrides,
      ...defaults
    } = options;

    // The synthetic fiddle defines none of the reviewed targets, so the real lists fail loudly.
    expect(() => assembleTrackerData(syntheticFiddle(), localizer, defaults)).toThrow(
      /Pipeline diagnostics failed:[\s\S]*missing-target[\s\S]*Obsolete reviewed diagnostic/,
    );
  });
});
