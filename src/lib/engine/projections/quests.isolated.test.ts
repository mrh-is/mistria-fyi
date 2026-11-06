import { describe, expect, it, vi } from "vitest";

import { projectQuests } from "#lib/engine/projections/quests.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type { UserProgressionState } from "#lib/engine/visibility.js";
import type { ItemId, QuestId, Season, SkillId } from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";

vi.mock("#lib/data/index.js", () => ({
  trackerData: {
    animals: {},
    categoryVisibility: {},
    items: {
      lilac: {
        sources: [{ type: "forage", availability: { type: "season", seasons: ["spring"] } }],
      },
    },
    pregnancyQuestByVillager: {},
    quests: {
      story: {
        acquired: {
          requirements: { start: { type: "itemAcquired", itemId: "lilac" }, stages: [] },
          sources: [],
        },
        item: {
          requirements: { start: { type: "itemAvailable", itemId: "lilac" }, stages: [] },
          sources: [],
        },
        progression: {
          requirements: {
            start: {
              type: "all",
              conditions: [
                { type: "skillLevel", level: 2, skillId: "fishing" },
                { type: "mineFloor", floor: 40 },
                { type: "quest", questId: "prerequisite", state: "completed" },
              ],
            },
            stages: [],
          },
          sources: [],
        },
        seasonal: {
          requirements: {
            start: { type: "season", seasons: ["summer"] },
            stages: [{ type: "season", seasons: ["winter"] }],
          },
          sources: [],
        },
      },
    },
  },
  trackerIndex: { memberToCanonicalAlmanacId: new Map([["lilac", "lilac"]]) },
}));

function context(
  season: Season = "spring",
  overrides: Partial<UserProgressionState> = {},
  progress: Partial<ProgressState> = {},
): ProgressContext {
  return {
    progress: makeCompletedState(progress),
    progressionState: {
      hasUpperFloor: false,
      heartLevels: {},
      isDating: false,
      knownVillagers: new Set(),
      marriedVillager: null,
      mineFloor: 0,
      questVisibility: { ["prerequisite" as QuestId]: "unavailable" },
      reachedSeason: "spring",
      renown: 0,
      showSpoilers: false,
      skillLevels: {},
      unlockedPerks: new Set(),
      ...overrides,
    },
    worldState: { season, weather: "calm" },
  };
}

const row = (id: string, ctx: ProgressContext) =>
  projectQuests(ctx).rows.find((quest) => quest.id === id);

describe("quest start availability", () => {
  it("uses the quest's own season even without an item source, separately from stages", () => {
    expect(row("seasonal", context())).toMatchObject({
      doable: false,
      doableAnywhere: false,
      shown: true,
    });
    expect(row("seasonal", context("summer"))).toMatchObject({
      doable: true,
      doableAnywhere: true,
    });
    expect(row("seasonal", context("winter"))?.doable).toBe(false);
  });

  it("requires all recorded progression gates", () => {
    const unlocked = {
      mineFloor: 40,
      questVisibility: { ["prerequisite" as QuestId]: "completed" as const },
      skillLevels: { ["fishing" as SkillId]: 2 },
    };
    expect(row("progression", context())?.doable).toBe(false);
    expect(row("progression", context("spring", unlocked))?.doable).toBe(true);
    expect(row("progression", context("spring", { ...unlocked, mineFloor: 39 }))?.doable).toBe(
      false,
    );
    expect(
      row(
        "progression",
        context("spring", { ...unlocked, skillLevels: { ["fishing" as SkillId]: 1 } }),
      )?.doable,
    ).toBe(false);
    expect(
      row(
        "progression",
        context("spring", {
          ...unlocked,
          questVisibility: { ["prerequisite" as QuestId]: "available" },
        }),
      )?.doable,
    ).toBe(false);
  });

  it("evaluates item obtainability using the item's own sources", () => {
    expect(row("item", context())?.doable).toBe(true);
    expect(row("item", context("summer"))?.doable).toBe(false);
  });

  it("uses recorded acquisition history independently of today's sources", () => {
    expect(row("acquired", context())?.doable).toBe(false);
    expect(
      row("acquired", context("summer", {}, { almanac: new Set(["lilac" as ItemId]) }))?.doable,
    ).toBe(true);
  });

  it("does not reapply a posting season to an obtained or completed quest", () => {
    expect(
      row(
        "seasonal",
        context("winter", {}, { questStates: { ["seasonal" as QuestId]: "obtained" } }),
      )?.doable,
    ).toBe(true);
    expect(
      row(
        "seasonal",
        context("winter", {}, { questStates: { ["seasonal" as QuestId]: "completed" } }),
      ),
    ).toMatchObject({ completed: true, doable: false, shown: true });
  });
});
