import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { recordValues } from "#lib/utils/record.js";

import { getCravingQuest, PREGNANCY_QUEST_IDS } from "./craving-quest.js";

import type { QuestId, VillagerId, VillagerRelationship } from "#lib/types/tracker-data.js";

const adelinePregnancy = "adeline_pregnancy_request" as QuestId;

function married(villager: string): Partial<Record<VillagerId, VillagerRelationship>> {
  return { [villager as VillagerId]: "married" };
}

describe("PREGNANCY_QUEST_IDS", () => {
  it("holds every mapped pregnancy quest", () => {
    const mapped = recordValues(trackerData.pregnancyQuestByVillager);
    expect(PREGNANCY_QUEST_IDS.size).toBe(mapped.length);
    expect(PREGNANCY_QUEST_IDS.has(adelinePregnancy)).toBe(true);
  });
});

describe("getCravingQuest", () => {
  it("is an applicable placeholder before marriage", () => {
    expect(getCravingQuest(makeCompletedState())).toEqual({
      applicable: true,
      completed: false,
      questId: undefined,
      villagerId: undefined,
    });
  });

  it("is not applicable when married to a Villager with no pregnancy quest", () => {
    const craving = getCravingQuest(
      makeCompletedState({ childChoice: "yes", villagerRelationships: married("balor") }),
    );
    expect(craving.applicable).toBe(false);
    expect(craving.questId).toBeUndefined();
    expect(craving.villagerId).toBe("balor" as VillagerId);
  });

  it("is not applicable when the household chose no children", () => {
    const craving = getCravingQuest(
      makeCompletedState({ childChoice: "no", villagerRelationships: married("adeline") }),
    );
    expect(craving.applicable).toBe(false);
  });

  it("tracks the spouse's pregnancy quest when children are wanted", () => {
    const pending = getCravingQuest(
      makeCompletedState({ childChoice: "yes", villagerRelationships: married("adeline") }),
    );
    expect(pending).toEqual({
      applicable: true,
      completed: false,
      questId: adelinePregnancy,
      villagerId: "adeline" as VillagerId,
    });

    const done = getCravingQuest(
      makeCompletedState({
        childChoice: "yes",
        questStates: { [adelinePregnancy]: "completed" },
        villagerRelationships: married("adeline"),
      }),
    );
    expect(done.completed).toBe(true);
  });
});
