import { afterEach, describe, expect, it, vi } from "vitest";

import { makeFiddle, stubLocalizer } from "../test-helpers.js";
import { extractQuests } from "./quests.js";

import type { QuestId, RecipeId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

const localizer = stubLocalizer();

describe("extractQuests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const emptyQuests = { cooking: {}, crown: {}, fetch: {}, heart: {}, mission: {}, story: {} };

  it("preserves a present tracked quest group with no accepted quests", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const fiddle = {
      quests: {
        story_quests: {
          default: {},
        },
      },
    } as unknown as ParsedGameData;

    expect(extractQuests(fiddle, localizer).quests).toEqual(emptyQuests);
  });

  it("maps a populated tracked quest with its name, Villager, and itemId", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const fiddle = makeFiddle({
      quests: {
        fetch_quests: {
          meet_juniper: {
            name: "Meet Juniper",
            npc_for_icon: "juniper",
            stages: [{ requirements: { has_item: "wild_berries" } }],
          },
        },
      },
    });

    const { localeNames, quests } = extractQuests(fiddle, localizer);
    expect(quests).toEqual({
      ...emptyQuests,
      fetch: {
        meet_juniper: {
          itemId: "wild_berries",
          sources: [],
          villager: "juniper",
        },
      },
    });
    expect(localeNames.ja["meet_juniper" as QuestId]).toBe("Meet Juniper");
  });

  it("does not log a summary when the quest root is absent", () => {
    const logSpy = vi.spyOn(console, "log").mockReturnValue(undefined);

    expect(extractQuests({} as ParsedGameData, localizer).quests).toEqual(emptyQuests);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("maps a heart quest with villager and heartLevel 0 (stamped later by visibility)", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const fiddle = makeFiddle({
      quests: {
        heart_quests: {
          tall_dark_and_mysterious: {
            name: "Tall, Dark and Mysterious",
            npc_for_icon: "balor",
            stages: [{ queries: [{ cutscene: "balor_two_hearts" }] }],
          },
        },
      },
    });

    expect(extractQuests(fiddle, localizer).quests).toEqual({
      ...emptyQuests,
      heart: {
        tall_dark_and_mysterious: {
          heartLevel: 0,
          sources: [],
          villager: "balor",
        },
      },
    });
  });

  it("extracts villager from stage query for pregnancy quests and sets heartLevel to 10", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const fiddle = makeFiddle({
      quests: {
        heart_quests: {
          adeline_pregnancy_request: {
            name: "A Craving",
            stages: [{ queries: [{ npc: "adeline" }] }],
          },
        },
      },
    });

    expect(extractQuests(fiddle, localizer).quests).toEqual({
      ...emptyQuests,
      heart: {
        adeline_pregnancy_request: {
          heartLevel: 10,
          sources: [],
          villager: "adeline",
        },
      },
    });
  });

  it("maps a cooking quest with its recipeId from recipeIdByItemId", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const fiddle = {
      quests: {
        tali_challenges: {
          crispy_fried_earthshroom_challenge: {
            name: "Crispy Fried Earthshroom",
            stages: [{ requirements: { has_item: "crispy_fried_earthshroom" } }],
          },
        },
      },
    } as unknown as ParsedGameData;

    const recipeIdByItemId = new Map([
      ["crispy_fried_earthshroom", "crispy_fried_earthshroom" as RecipeId],
    ]);

    expect(extractQuests(fiddle, localizer, recipeIdByItemId).quests).toEqual({
      ...emptyQuests,
      cooking: {
        crispy_fried_earthshroom_challenge: {
          recipeId: "crispy_fried_earthshroom",
          sources: [],
        },
      },
    });
  });

  it("throws when a cooking quest has no has_item requirement", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const fiddle = {
      quests: {
        tali_challenges: {
          bad_challenge: {
            name: "Bad Challenge",
            stages: [{ requirements: {} }],
          },
        },
      },
    } as unknown as ParsedGameData;

    expect(() => extractQuests(fiddle, localizer, new Map())).toThrow(
      'Cooking quest "bad_challenge" has no has_item requirement in any stage',
    );
  });

  it("throws when a cooking quest's required item has no matching recipe", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const fiddle = {
      quests: {
        tali_challenges: {
          orphan_challenge: {
            name: "Orphan Challenge",
            stages: [{ requirements: { has_item: "unknown_item" } }],
          },
        },
      },
    } as unknown as ParsedGameData;

    expect(() => extractQuests(fiddle, localizer, new Map())).toThrow(
      'Cooking quest "orphan_challenge" requires item "unknown_item" which has no matching recipe',
    );
  });

  it("resolves a quantity-object has_item for a cooking quest", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const fiddle = {
      quests: {
        tali_challenges: {
          qty_challenge: {
            name: "Quantity Challenge",
            stages: [{ requirements: { has_item: { some_dish: 3 } } }],
          },
        },
      },
    } as unknown as ParsedGameData;

    const recipeIdByItemId = new Map([["some_dish", "some_dish" as RecipeId]]);

    const result = extractQuests(fiddle, localizer, recipeIdByItemId);
    expect(result.quests.cooking["qty_challenge" as QuestId]).toMatchObject({
      recipeId: "some_dish",
    });
  });

  it.each(["recipe_scroll", "crafting_scroll"])(
    "resolves a fetch quest %s reward item to its recipe ID",
    (scrollField) => {
      const fiddle = makeFiddle({
        quests: {
          fetch_quests: {
            furniture_delivery: {
              name: "Furniture Delivery",
              npc_for_icon: "eiland",
              rewards: [{ [scrollField]: "blue_chair" }],
              stages: [{ requirements: { has_item: "wood" } }],
            },
          },
        },
      });
      const recipeIdByItemId = new Map([["blue_chair", "sapling_chair" as RecipeId]]);

      expect(extractQuests(fiddle, localizer, recipeIdByItemId).quests.fetch).toMatchObject({
        furniture_delivery: { rewardRecipeId: "sapling_chair" },
      });
    },
  );

  it.each(["recipe_scroll", "crafting_scroll"])(
    "rejects an unresolved fetch quest %s reward",
    (scrollField) => {
      const fiddle = makeFiddle({
        quests: {
          fetch_quests: {
            furniture_delivery: {
              name: "Furniture Delivery",
              npc_for_icon: "eiland",
              rewards: [{ [scrollField]: "unknown_chair" }],
              stages: [{ requirements: { has_item: "wood" } }],
            },
          },
        },
      });

      expect(() => extractQuests(fiddle, localizer, new Map())).toThrow(
        `Fetch quest "furniture_delivery" rewards ${scrollField} "unknown_chair" with no matching recipe in quests.toml`,
      );
    },
  );

  it.each(["fetch_quests", "heart_quests"])(
    "rejects a %s quest without a villager instead of using its quest ID",
    (group) => {
      const quest = {
        name: "Unknown Villager",
        stages: [{ requirements: { has_item: "wood" } }],
      };
      const fiddle = makeFiddle({ quests: { [group]: { no_villager: quest } } });

      expect(() => extractQuests(fiddle, localizer)).toThrow(
        `Quest "no_villager" has no villager in quests.toml`,
      );
    },
  );
});
