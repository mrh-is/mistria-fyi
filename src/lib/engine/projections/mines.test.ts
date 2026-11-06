import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { mineFloorProgress, sealsBefore } from "#lib/engine/projections/mines.js";
import { progressShelf } from "#lib/engine/shelves.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";

import type { QuestId } from "#lib/types/tracker-data.js";
import type { QuestState } from "#lib/types/user-progress.js";

const MAX_FLOOR = 100;

function sealQuest(id: string): QuestId {
  const seal = trackerData.mines.seals.find((candidate) => candidate.id === id);
  if (!seal) throw new Error(`No seal ${id}`);
  return seal.questId;
}

function floors(mineFloor: number, ...brokenSeals: string[]) {
  const questStates: Partial<Record<QuestId, QuestState>> = Object.fromEntries(
    brokenSeals.map((id) => [sealQuest(id), "completed"]),
  );
  return mineFloorProgress({ ...makeCompletedState(), mineFloor, questStates });
}

function quest(id: string) {
  return { type: "questCompleted", questId: sealQuest(id) };
}

function before(mineFloor: number, target: number, ...brokenSeals: string[]) {
  return sealsBefore(
    {
      ...makeCompletedState(),
      mineFloor,
      questStates: Object.fromEntries(brokenSeals.map((id) => [sealQuest(id), "completed"])),
    },
    target,
  );
}

describe("sealsBefore", () => {
  it("asks for the seal's quest when the next floor is past it", () => {
    expect(before(20, 21)).toEqual(quest("water"));
  });

  it("lets a player walk up to a seal, and past a broken one", () => {
    expect(before(19, 20)).toBeUndefined();
    expect(before(20, 21, "water")).toBeUndefined();
  });

  it("ignores seals the player is already past, and moves back up", () => {
    expect(before(25, 26)).toBeUndefined();
    expect(before(20, 19)).toBeUndefined();
  });

  it("asks for every seal a jump crosses", () => {
    expect(before(5, 50)).toEqual({
      type: "and",
      conditions: [quest("water"), quest("earth")],
    });
  });
});

describe("mineFloorProgress", () => {
  it("counts floors down to the first seal as doable", () => {
    expect(floors(5)).toMatchObject({ completed: 5, todo: 15, total: MAX_FLOOR, waiting: 80 });
  });

  it("has no doable floors for a player at an unbroken seal", () => {
    const progress = floors(20);
    expect(progress).toMatchObject({ todo: 0, waiting: 80 });
    expect(progressShelf(progress)).toBe("notNow");
  });

  it("reaches the next seal once the quest breaks this one", () => {
    expect(floors(20, "water")).toMatchObject({ todo: 20, waiting: 60 });
  });

  it("treats a seal above the player's floor as broken, whatever its quest says", () => {
    expect(floors(25)).toMatchObject({ todo: 15, waiting: 60 });
  });

  it("stops at the Priestess Quarters' door until its quest is done", () => {
    expect(floors(90)).toMatchObject({ todo: 0, waiting: 10 });
    expect(floors(90, "priestess")).toMatchObject({ todo: 10, waiting: 0 });
  });

  it("has nothing left at the last floor", () => {
    const progress = floors(MAX_FLOOR);
    expect(progress).toMatchObject({ completed: MAX_FLOOR, todo: 0, waiting: 0 });
    expect(progressShelf(progress)).toBe("completed");
  });

  it("keeps every floor in the total", () => {
    for (const mineFloor of [0, 19, 20, 21, 80, 99]) {
      const { completed, todo, total, waiting } = floors(mineFloor);
      expect(completed + todo + waiting).toBe(total);
    }
  });
});
