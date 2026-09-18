import { afterEach, describe, expect, it, vi } from "vitest";

import { extractQuests } from "./quests";

import type { QuestId, RecipeId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle";

vi.mock("../localize", () => ({
  localizeField: vi.fn((_assetsDir: string, input: { englishValue: string }) => ({
    fallbackLocales: [],
    values: {
      en: input.englishValue,
      es: input.englishValue,
      fr: input.englishValue,
      ja: input.englishValue,
      ko: input.englishValue,
      ru: input.englishValue,
      "zh-Hans": input.englishValue,
      "zh-Hant": input.englishValue,
    },
  })),
}));
const assetsDir = "test-assets";

describe("extractQuests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const emptyQuests = { cooking: {}, crown: {}, fetch: {}, heart: {}, mission: {}, story: {} };

  it("preserves a present tracked quest group with no accepted quests", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = {
      quests: {
        story_quests: {
          default: {},
        },
      },
    } as unknown as ParsedGameData;

    expect(extractQuests(fiddle, assetsDir).quests).toEqual(emptyQuests);
  });

  it("maps a populated tracked quest with its name, NPC, and itemId", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = {
      quests: {
        fetch_quests: {
          meet_juniper: {
            name: "Meet Juniper",
            npc_for_icon: "juniper",
            stages: [{ requirements: { has_item: "wild_berries" } }],
          },
        },
      },
    } as unknown as ParsedGameData;

    const { localeNames, quests } = extractQuests(fiddle, assetsDir);
    expect(quests).toEqual({
      ...emptyQuests,
      fetch: {
        meet_juniper: {
          itemId: "wild_berries",
          npc: "juniper",
          sources: [],
        },
      },
    });
    expect(localeNames.ja["meet_juniper" as QuestId]).toBe("Meet Juniper");
  });

  it("does not log a summary when the quest root is absent", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(extractQuests({} as ParsedGameData, assetsDir).quests).toEqual(emptyQuests);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("maps a heart quest with npc and heartLevel 0 (stamped later by visibility)", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = {
      quests: {
        heart_quests: {
          tall_dark_and_mysterious: {
            name: "Tall, Dark and Mysterious",
            npc_for_icon: "balor",
            stages: [{ queries: [{ cutscene: "balor_two_hearts" }] }],
          },
        },
      },
    } as unknown as ParsedGameData;

    expect(extractQuests(fiddle, assetsDir).quests).toEqual({
      ...emptyQuests,
      heart: {
        tall_dark_and_mysterious: {
          heartLevel: 0,
          npc: "balor",
          sources: [],
        },
      },
    });
  });

  it("extracts NPC from stage query for pregnancy quests and sets heartLevel to 10", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const fiddle = {
      quests: {
        heart_quests: {
          adeline_pregnancy_request: {
            name: "A Craving",
            stages: [{ queries: [{ npc: "adeline" }] }],
          },
        },
      },
    } as unknown as ParsedGameData;

    expect(extractQuests(fiddle, assetsDir).quests).toEqual({
      ...emptyQuests,
      heart: {
        adeline_pregnancy_request: {
          heartLevel: 10,
          npc: "adeline",
          sources: [],
        },
      },
    });
  });

  it("maps a cooking quest with its recipeId from recipeIdByItemId", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
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

    expect(extractQuests(fiddle, assetsDir, recipeIdByItemId).quests).toEqual({
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
    vi.spyOn(console, "log").mockImplementation(() => undefined);
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

    expect(() => extractQuests(fiddle, assetsDir, new Map())).toThrow(
      'Cooking quest "bad_challenge" has no has_item requirement in any stage',
    );
  });

  it("throws when a cooking quest's required item has no matching recipe", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
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

    expect(() => extractQuests(fiddle, assetsDir, new Map())).toThrow(
      'Cooking quest "orphan_challenge" requires item "unknown_item" which has no matching recipe',
    );
  });

  it("resolves a quantity-object has_item for a cooking quest", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
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

    const result = extractQuests(fiddle, assetsDir, recipeIdByItemId);
    expect(result.quests.cooking["qty_challenge" as QuestId]).toMatchObject({
      recipeId: "some_dish",
    });
  });
});
