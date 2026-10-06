import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { getName, nameCollator } from "#lib/data/names.js";
import { PREGNANCY_QUEST_IDS } from "#lib/engine/craving-quest.js";
import { buildQuestSections, QUEST_TYPE_ORDER } from "#lib/presentation/quest-sections.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { recordKeys } from "#lib/utils/record.js";

import type { QuestRow, QuestSection } from "#lib/presentation/quest-sections.js";
import type {
  QuestId,
  QuestType,
  VillagerId,
  VillagerRelationship,
} from "#lib/types/tracker-data.js";
import type { CompletedState } from "#lib/types/user-progress.js";

function married(villager: string): Partial<Record<VillagerId, VillagerRelationship>> {
  return { [villager as VillagerId]: "married" };
}

function section(sections: QuestSection[], questType: QuestType): QuestSection {
  const found = sections.find((s) => s.questType === questType);
  if (!found) throw new Error(`No ${questType} section`);
  return found;
}

function cravingRow(completed: CompletedState): QuestRow | undefined {
  return section(buildQuestSections(completed, "en"), "heart").rows.find(
    (row) => row.kind === "craving",
  );
}

describe("buildQuestSections", () => {
  const sections = buildQuestSections(makeCompletedState(), "en");

  it("returns one non-empty section per quest type, in display order", () => {
    expect(sections.map((s) => s.questType)).toEqual(
      QUEST_TYPE_ORDER.filter((type) =>
        recordKeys(trackerData.quests[type]).some((id) => !PREGNANCY_QUEST_IDS.has(id)),
      ),
    );
    for (const s of sections) expect(s.rows.length).toBeGreaterThan(0);
  });

  it("never lists a pregnancy quest as its own row", () => {
    const questIds = sections.flatMap((s) =>
      s.rows.filter((row) => row.kind === "quest").map((row) => row.id),
    );
    for (const id of questIds) expect(PREGNANCY_QUEST_IDS.has(id)).toBe(false);
  });

  it("lists every other quest exactly once", () => {
    const expected = QUEST_TYPE_ORDER.flatMap((type) =>
      recordKeys(trackerData.quests[type]).filter((id) => !PREGNANCY_QUEST_IDS.has(id)),
    );
    const listed = sections.flatMap((s) =>
      s.rows.filter((row) => row.kind === "quest").map((row) => row.id),
    );
    expect(listed.toSorted()).toEqual(expected.toSorted());
  });

  it("follows the game's chain order where one exists", () => {
    for (const s of sections) {
      const chain = trackerData.questOrder[s.questType];
      if (!chain) continue;
      const chained = s.rows.map((row) => row.id).filter((id) => chain.includes(id));
      expect(chained).toEqual(chain.filter((id) => chained.includes(id)));
      expect(s.rows.slice(0, chained.length).map((row) => row.id)).toEqual(chained);
    }
  });

  it("sorts fetch quests by item name and labels each with its Villager", () => {
    const fetch = section(sections, "fetch").rows;
    const names = fetch.map((row) => row.displayName);
    expect(names).toEqual(names.toSorted((a, b) => nameCollator("en").compare(a, b)));
    for (const row of fetch) {
      if (row.kind !== "quest") continue;
      const quest = trackerData.quests.fetch[row.id];
      expect(row.displayName).toBe(getName("items", quest.itemId, "en"));
      expect(row.subtitle).toContain(getName("villagers", quest.villager, "en"));
    }
  });

  it("groups heart quests by Villager in ascending heart level, with the craving row last", () => {
    const heart = section(sections, "heart").rows;
    expect(heart.at(-1)?.kind).toBe("craving");
    const keys = heart
      .filter((row) => row.kind === "quest")
      .map((row) => {
        const quest = trackerData.quests.heart[row.id];
        return { level: quest.heartLevel, villager: getName("villagers", quest.villager, "en") };
      });
    const sorted = keys.toSorted(
      (a, b) => nameCollator("en").compare(a.villager, b.villager) || a.level - b.level,
    );
    expect(keys).toEqual(sorted);
  });
});

describe("craving row", () => {
  const adelinePregnancy = "adeline_pregnancy_request" as QuestId;

  it("is a placeholder before marriage", () => {
    expect(cravingRow(makeCompletedState())).toMatchObject({
      completed: false,
      displayName: "A Craving",
      id: "craving_synthetic",
      kind: "craving",
      questId: undefined,
      subtitle: undefined,
    });
  });

  it("is absent when the spouse has no pregnancy quest", () => {
    const completed = makeCompletedState({
      childChoice: "yes",
      villagerRelationships: married("balor"),
    });
    expect(cravingRow(completed)).toBeUndefined();
  });

  it("tracks the spouse's pregnancy quest", () => {
    const completed = makeCompletedState({
      childChoice: "yes",
      questStates: { [adelinePregnancy]: "completed" },
      villagerRelationships: married("adeline"),
    });
    expect(cravingRow(completed)).toMatchObject({
      completed: true,
      id: adelinePregnancy,
      questId: adelinePregnancy,
      subtitle: getName("villagers", "adeline" as VillagerId, "en"),
    });
  });
});
