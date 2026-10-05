import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildQuestTypeIndex,
  forEachItem,
  forEachQuest,
  TRACKED_QUEST_GROUPS,
} from "./extractor-helpers.js";
import { makeFiddle as makeFiddleBase } from "./test-helpers.js";

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({ items: {}, quests: {}, ...overrides });
}

describe("forEachItem", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    vi.spyOn(console, "warn").mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produces no callbacks when items root is absent", () => {
    const fiddle = makeFiddle({ items: undefined });
    const calls: unknown[][] = [];
    forEachItem(fiddle, (...args) => calls.push(args));
    expect(calls).toHaveLength(0);
  });

  it("produces no callbacks when items root is an empty object", () => {
    const fiddle = makeFiddle({ items: {} });
    const calls: unknown[][] = [];
    forEachItem(fiddle, (...args) => calls.push(args));
    expect(calls).toHaveLength(0);
  });

  it("skips default entries", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          set_a: {
            default: { name: "Default" },
            table: { name: "Table" },
          },
        },
      },
    });
    const ids: string[] = [];
    forEachItem(fiddle, (itemId) => ids.push(itemId));
    expect(ids).toEqual(["table"]);
  });

  it("skips null entries", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          set_a: {
            null_item: null,
            valid_item: { name: "Chair" },
          },
        },
      },
    });
    const ids: string[] = [];
    forEachItem(fiddle, (itemId) => ids.push(itemId));
    expect(ids).toEqual(["valid_item"]);
  });

  it("skips primitive (non-object) entries", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          misc: {
            num_item: 42,
            str_item: "hello",
            valid_item: { name: "Gem" },
          },
        },
      },
    });
    const ids: string[] = [];
    forEachItem(fiddle, (itemId) => ids.push(itemId));
    expect(ids).toEqual(["valid_item"]);
  });

  it("valid item callback receives itemId, item record, topCategory, and subCategory", () => {
    const itemRecord = { name: "Wooden Chair" };
    const fiddle = makeFiddle({
      items: {
        furniture: {
          seating: {
            wooden_chair: itemRecord,
          },
        },
      },
    });
    const calls: [string, Record<string, unknown>, string, string][] = [];
    forEachItem(fiddle, (itemId, item, topCat, subCat) =>
      calls.push([itemId, item, topCat, subCat]),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["wooden_chair", itemRecord, "furniture", "seating"]);
  });

  it("iterates items across multiple top categories and sub categories", () => {
    const fiddle = makeFiddle({
      items: {
        furniture: {
          seating: { chair: { name: "Chair" } },
          tables: { desk: { name: "Desk" } },
        },
        other: {
          crops: { carrot: { name: "Carrot" } },
        },
      },
    });
    const calls: string[] = [];
    forEachItem(fiddle, (itemId) => calls.push(itemId));
    expect(calls).toEqual(["chair", "desk", "carrot"]);
  });
});

describe("TRACKED_QUEST_GROUPS", () => {
  it("contains exactly the six tracked quest group keys", () => {
    expect(TRACKED_QUEST_GROUPS).toEqual([
      "story_quests",
      "heart_quests",
      "fetch_quests",
      "crown_quests",
      "stillwell_challenges",
      "tali_challenges",
    ]);
  });

  it("builds a normalized quest-type index for every tracked group", () => {
    const fiddle = makeFiddle({
      quests: {
        crown_quests: { crown_case: {} },
        fetch_quests: { fetch_case: {} },
        heart_quests: { heart_case: {} },
        stillwell_challenges: { mission_case: {} },
        story_quests: { story_case: {} },
        tali_challenges: { cooking_case: {} },
      },
    });

    expect(buildQuestTypeIndex(fiddle)).toEqual(
      new Map([
        ["cooking_case", "cooking"],
        ["crown_case", "crown"],
        ["fetch_case", "fetch"],
        ["heart_case", "heart"],
        ["mission_case", "mission"],
        ["story_case", "story"],
      ]),
    );
  });

  it("rejects a quest ID assigned to conflicting normalized types", () => {
    const fiddle = makeFiddle({
      quests: {
        fetch_quests: { duplicate: {} },
        story_quests: { duplicate: {} },
      },
    });

    expect(() => buildQuestTypeIndex(fiddle)).toThrow(
      'Quest "duplicate" appears in both story and fetch groups',
    );
  });
});

describe("forEachQuest", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    vi.spyOn(console, "warn").mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("produces no callbacks when quests root is absent", () => {
    const fiddle = makeFiddle({ quests: undefined });
    const calls: unknown[][] = [];
    forEachQuest(fiddle, TRACKED_QUEST_GROUPS, (...args) => calls.push(args));
    expect(calls).toHaveLength(0);
  });

  it("produces no callbacks when quest groups array is empty", () => {
    const fiddle = makeFiddle({
      quests: { fetch_quests: { q1: { name: "Quest 1" } } },
    });
    const calls: unknown[][] = [];
    forEachQuest(fiddle, [], (...args) => calls.push(args));
    expect(calls).toHaveLength(0);
  });

  it("skips default entries", () => {
    const fiddle = makeFiddle({
      quests: {
        fetch_quests: {
          default: { name: "Default" },
          real_quest: { name: "Real Quest" },
        },
      },
    });
    const ids: string[] = [];
    forEachQuest(fiddle, ["fetch_quests"], (_type, questId) => ids.push(questId));
    expect(ids).toEqual(["real_quest"]);
  });

  it("skips null quest records", () => {
    const fiddle = makeFiddle({
      quests: {
        fetch_quests: {
          null_quest: null,
          valid_quest: { name: "Valid" },
        },
      },
    });
    const ids: string[] = [];
    forEachQuest(fiddle, ["fetch_quests"], (_type, questId) => ids.push(questId));
    expect(ids).toEqual(["valid_quest"]);
  });

  it("callback receives questType, questId, and quest record", () => {
    const questRecord = { name: "Fetch Apples" };
    const fiddle = makeFiddle({
      quests: {
        fetch_quests: {
          fetch_apples: questRecord,
        },
      },
    });
    const calls: [string, string, Record<string, unknown>][] = [];
    forEachQuest(fiddle, ["fetch_quests"], (type, id, quest) => calls.push([type, id, quest]));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(["fetch_quests", "fetch_apples", questRecord]);
  });

  it("honors caller-provided quest subsets", () => {
    const fiddle = makeFiddle({
      quests: {
        fetch_quests: { q1: { name: "Q1" } },
        heart_quests: { q3: { name: "Q3" } },
        story_quests: { q2: { name: "Q2" } },
      },
    });
    const types: string[] = [];
    forEachQuest(fiddle, ["fetch_quests", "story_quests"], (type) => types.push(type));
    expect(types).toEqual(["fetch_quests", "story_quests"]);
  });

  it("skips quest groups not present in fiddle", () => {
    const fiddle = makeFiddle({ quests: {} });
    const calls: unknown[][] = [];
    forEachQuest(fiddle, TRACKED_QUEST_GROUPS, (...args) => calls.push(args));
    expect(calls).toHaveLength(0);
  });
});
