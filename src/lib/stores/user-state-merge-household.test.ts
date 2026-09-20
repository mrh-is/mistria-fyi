import { afterEach, describe, expect, it } from "vitest";

import { userState } from "$lib/stores/user-state.svelte.js";

import type { VillagerId } from "$lib/types/tracker-data.js";

const ADELINE = "adeline" as VillagerId;
const BALOR = "balor" as VillagerId;
const CELINE = "celine" as VillagerId;

afterEach(() => {
  userState.resetAll();
});

describe("mergeFromSave household policy", () => {
  it("silently applies an incoming marriage when no local spouse exists", () => {
    userState.setVillagerRelationship(CELINE, "proposed");

    const { conflicts, counts } = userState.mergeFromSave({
      childChoice: "yes",
      villagerRelationships: { [ADELINE]: "married" },
    });

    expect(userState.state.completed.villagerRelationships[ADELINE]).toBe("married");
    expect(userState.state.completed.villagerRelationships[CELINE]).toBe("platonic");
    expect(userState.state.completed.childChoice).toBe("yes");
    expect(counts.villagerRelationships).toBe(1);
    expect(counts.childChoice).toBe(1);
    expect(conflicts).toEqual([]);
  });

  it("flags a same-spouse child-choice conflict and keeps the local choice", () => {
    userState.setVillagerRelationship(ADELINE, "married");
    userState.setChildChoice("yes");

    const { conflicts, counts } = userState.mergeFromSave({
      childChoice: "no",
      villagerRelationships: { [ADELINE]: "married" },
    });

    expect(userState.state.completed.childChoice).toBe("yes");
    expect(counts.childChoice).toBe(0);
    expect(conflicts).toEqual([
      {
        incomingChildChoice: "no",
        kind: "childChoice",
        localChildChoice: "yes",
        villagerId: ADELINE,
      },
    ]);
  });

  it("applies an undeclared-to-declared child choice silently for the existing spouse", () => {
    userState.setVillagerRelationship(ADELINE, "married");

    const { conflicts, counts } = userState.mergeFromSave({
      childChoice: "yes",
      villagerRelationships: { [ADELINE]: "married" },
    });

    expect(userState.state.completed.childChoice).toBe("yes");
    expect(counts.childChoice).toBe(1);
    expect(conflicts).toEqual([]);
  });

  it("no-ops when the incoming child choice is undeclared", () => {
    userState.setVillagerRelationship(ADELINE, "married");
    userState.setChildChoice("yes");

    const { conflicts, counts } = userState.mergeFromSave({
      childChoice: "undeclared",
      villagerRelationships: { [ADELINE]: "married" },
    });

    expect(userState.state.completed.childChoice).toBe("yes");
    expect(counts.childChoice).toBe(0);
    expect(conflicts).toEqual([]);
  });

  it("treats a different incoming spouse as one household conflict and keeps the local marriage", () => {
    userState.setVillagerRelationship(ADELINE, "married");
    userState.setChildChoice("yes");

    const { conflicts, counts } = userState.mergeFromSave({
      childChoice: "no",
      villagerRelationships: { [BALOR]: "married" },
    });

    expect(userState.state.completed.villagerRelationships[ADELINE]).toBe("married");
    expect(userState.state.completed.villagerRelationships[BALOR]).toBe("platonic");
    expect(userState.state.completed.childChoice).toBe("yes");
    expect(counts.villagerRelationships).toBe(0);
    expect(counts.childChoice).toBe(0);
    expect(conflicts).toEqual([
      { incomingVillagerId: BALOR, kind: "spouse", localVillagerId: ADELINE },
    ]);
  });

  it("flags a downgrade of the local spouse as a relationship conflict", () => {
    userState.setVillagerRelationship(ADELINE, "married");

    const { conflicts, counts } = userState.mergeFromSave({
      villagerRelationships: { [ADELINE]: "romantic" },
    });

    expect(userState.state.completed.villagerRelationships[ADELINE]).toBe("married");
    expect(counts.villagerRelationships).toBe(0);
    expect(conflicts).toEqual([
      {
        incomingRelationship: "romantic",
        kind: "relationship",
        localRelationship: "married",
        villagerId: ADELINE,
      },
    ]);
  });

  it("no-ops for a villager omitted from the incoming data", () => {
    userState.setVillagerRelationship(BALOR, "proposed");

    const { conflicts, counts } = userState.mergeFromSave({
      villagerRelationships: { [CELINE]: "romantic" },
    });

    expect(userState.state.completed.villagerRelationships[BALOR]).toBe("proposed");
    expect(userState.state.completed.villagerRelationships[CELINE]).toBe("romantic");
    expect(counts.villagerRelationships).toBe(1);
    expect(conflicts).toEqual([]);
  });

  it("no-ops when the local spouse is omitted from the incoming data", () => {
    userState.setVillagerRelationship(ADELINE, "married");
    userState.setChildChoice("yes");

    const { conflicts, counts } = userState.mergeFromSave({
      villagerRelationships: { [CELINE]: "platonic" },
    });

    expect(userState.state.completed.villagerRelationships[ADELINE]).toBe("married");
    expect(userState.state.completed.villagerRelationships[CELINE]).toBe("platonic");
    expect(userState.state.completed.childChoice).toBe("yes");
    expect(counts.villagerRelationships).toBe(0);
    expect(conflicts).toEqual([]);
  });

  it("ignores a child choice when neither side has a spouse", () => {
    const { conflicts, counts } = userState.mergeFromSave({ childChoice: "yes" });

    expect(userState.state.completed.childChoice).toBe("undeclared");
    expect(counts.childChoice).toBe(0);
    expect(conflicts).toEqual([]);
  });

  it("applies a forward move within a branch silently when no spouse is involved", () => {
    userState.setVillagerRelationship(CELINE, "romantic");

    const { conflicts, counts } = userState.mergeFromSave({
      villagerRelationships: { [CELINE]: "proposed" },
    });

    expect(userState.state.completed.villagerRelationships[CELINE]).toBe("proposed");
    expect(counts.villagerRelationships).toBe(1);
    expect(conflicts).toEqual([]);
  });

  it("flags a cross-branch move as a conflict without a spouse involved", () => {
    userState.setVillagerRelationship(CELINE, "romantic");

    const { conflicts, counts } = userState.mergeFromSave({
      villagerRelationships: { [CELINE]: "platonic" },
    });

    expect(userState.state.completed.villagerRelationships[CELINE]).toBe("romantic");
    expect(counts.villagerRelationships).toBe(0);
    expect(conflicts).toEqual([
      {
        incomingRelationship: "platonic",
        kind: "relationship",
        localRelationship: "romantic",
        villagerId: CELINE,
      },
    ]);
  });

  it("never treats an incoming undecided relationship as a downgrade", () => {
    userState.setVillagerRelationship(CELINE, "proposed");

    const { conflicts, counts } = userState.mergeFromSave({
      villagerRelationships: { [CELINE]: "undecided" },
    });

    expect(userState.state.completed.villagerRelationships[CELINE]).toBe("proposed");
    expect(counts.villagerRelationships).toBe(0);
    expect(conflicts).toEqual([]);
  });

  it("merges nonconflicting additive relationship data alongside other progress", () => {
    const { conflicts, counts } = userState.mergeFromSave({
      renown: 5,
      villagerRelationships: { [CELINE]: "romantic" },
    });

    expect(userState.state.completed.villagerRelationships[CELINE]).toBe("romantic");
    expect(userState.state.completed.renown).toBe(5);
    expect(counts.villagerRelationships).toBe(1);
    expect(counts.renown).toBe(5);
    expect(conflicts).toEqual([]);
  });

  it("cascades a new marriage over a locally proposed villager, allowing that one downgrade", () => {
    userState.setVillagerRelationship(CELINE, "proposed");

    const { conflicts } = userState.mergeFromSave({
      villagerRelationships: { [ADELINE]: "married" },
    });

    expect(userState.state.completed.villagerRelationships[ADELINE]).toBe("married");
    expect(userState.state.completed.villagerRelationships[CELINE]).toBe("platonic");
    expect(conflicts).toEqual([]);
  });
});
