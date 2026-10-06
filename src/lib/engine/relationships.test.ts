import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";

import {
  getMarriedVillager,
  isRomantic,
  mergeHousehold,
  normalizeRelationships,
  relationshipPresentation,
} from "./relationships.js";

import type { VillagerId, VillagerRelationship } from "#lib/types/tracker-data.js";

function rels(
  obj: Record<string, VillagerRelationship>,
): Partial<Record<VillagerId, VillagerRelationship>> {
  return obj;
}

// ─── getMarriedVillager ────────────────────────────────────────────────

describe("getMarriedVillager", () => {
  it("returns null when no Villager is married", () => {
    expect(getMarriedVillager({})).toBeNull();
  });

  it("returns null when all relationships are non-married", () => {
    expect(
      getMarriedVillager(rels({ adeline: "romantic", balor: "platonic", celine: "proposed" })),
    ).toBeNull();
  });

  it("returns the married Villager ID", () => {
    expect(getMarriedVillager(rels({ adeline: "married", balor: "platonic" }))).toBe("adeline");
  });
});

// ─── isRomantic ───────────────────────────────────────────────────

describe("isRomantic", () => {
  const r = rels({
    adeline: "romantic",
    balor: "proposed",
    caldarus: "married",
    celine: "platonic",
  });

  it("returns true for romantic", () => {
    expect(isRomantic(r, "adeline" as VillagerId)).toBe(true);
  });

  it("returns true for proposed", () => {
    expect(isRomantic(r, "balor" as VillagerId)).toBe(true);
  });

  it("returns true for married", () => {
    expect(isRomantic(r, "caldarus" as VillagerId)).toBe(true);
  });

  it("returns false for platonic", () => {
    expect(isRomantic(r, "celine" as VillagerId)).toBe(false);
  });

  it("returns false for undecided (absent)", () => {
    expect(isRomantic(r, "juniper" as VillagerId)).toBe(false);
  });
});

// ─── normalizeRelationships ───────────────────────────────────────

describe("normalizeRelationships", () => {
  it("does nothing when no one is married", () => {
    const input = rels({ adeline: "romantic", balor: "proposed" });
    const copy = { ...input };
    normalizeRelationships(copy);
    expect(copy).toEqual(input);
  });

  it("forces all other dateable Villagers to platonic when one is married", () => {
    const input = rels({ adeline: "married", balor: "romantic" });
    normalizeRelationships(input);
    expect(input["adeline" as VillagerId]).toBe("married");
    expect(input["balor" as VillagerId]).toBe("platonic");
  });

  it("adds platonic for dateable Villagers not yet in the map", () => {
    const input = rels({ adeline: "married" });
    normalizeRelationships(input);

    const dateableVillagers = Object.entries(trackerData.villagers)
      .filter(([, villager]) => villager.dateable)
      .map(([id]) => id as VillagerId);

    for (const villagerId of dateableVillagers) {
      expect(input[villagerId]).toBe(
        villagerId === ("adeline" as VillagerId) ? "married" : "platonic",
      );
    }
  });
});

describe("relationshipPresentation", () => {
  const villagerId = "adeline" as VillagerId;

  it.each([
    {
      actions: [],
      childChoice: "undeclared",
      level: 0,
      relationship: "undecided",
      status: undefined,
    },
    {
      actions: [],
      childChoice: "undeclared",
      level: 7,
      relationship: "undecided",
      status: undefined,
    },
    {
      actions: ["platonic", "romantic"],
      childChoice: "undeclared",
      level: 8,
      relationship: "undecided",
      status: "path_not_chosen",
    },
    {
      actions: ["platonic", "romantic"],
      childChoice: "undeclared",
      level: 12,
      relationship: "undecided",
      status: "path_not_chosen",
    },
    {
      actions: [],
      childChoice: "undeclared",
      level: 12,
      relationship: "platonic",
      status: "best_friends",
    },
    {
      actions: [],
      childChoice: "undeclared",
      level: 9,
      relationship: "romantic",
      status: "dating",
    },
    {
      actions: ["proposed"],
      childChoice: "undeclared",
      level: 10,
      relationship: "romantic",
      status: "dating",
    },
    {
      actions: ["married"],
      childChoice: "undeclared",
      level: 10,
      relationship: "proposed",
      status: "engaged",
    },
    {
      actions: ["yes", "no"],
      childChoice: "undeclared",
      level: 12,
      relationship: "married",
      status: "married",
    },
    {
      actions: [],
      childChoice: "yes",
      level: 12,
      relationship: "married",
      status: "married_kids",
    },
    {
      actions: [],
      childChoice: "no",
      level: 12,
      relationship: "married",
      status: "married_child_free",
    },
  ] as const)(
    "projects $relationship at level $level with household choice $childChoice",
    ({ actions, childChoice, level, relationship, status }) => {
      const presentation = relationshipPresentation({
        childChoice,
        level,
        marriedVillager: relationship === "married" ? villagerId : null,
        relationship,
        villagerId,
      });

      expect(presentation.status).toBe(status);
      expect(presentation.actions).toEqual(actions);
    },
  );

  it("associates a warning only with the marriage action", () => {
    const presentation = relationshipPresentation({
      childChoice: "undeclared",
      level: 10,
      marriedVillager: null,
      relationship: "proposed",
      villagerId,
    });

    expect(presentation.warning).toBe(true);
    expect(presentation.actions).toEqual(["married"]);
  });

  it("closes romantic actions when another Villager is married", () => {
    expect(
      relationshipPresentation({
        childChoice: "undeclared",
        level: 12,
        marriedVillager: "celine" as VillagerId,
        relationship: "romantic",
        villagerId,
      }),
    ).toEqual({ actions: [], status: "best_friends" });
  });
});

// ─── mergeHousehold ───────────────────────────────────────────────

describe("mergeHousehold", () => {
  const ADELINE = "adeline" as VillagerId;
  const BALOR = "balor" as VillagerId;
  const CELINE = "celine" as VillagerId;

  it("leaves the household unchanged when nothing comes in", () => {
    const local = {
      childChoice: "yes" as const,
      villagerRelationships: rels({ adeline: "married" }),
    };

    expect(mergeHousehold(local, {})).toEqual({
      childChoice: "yes",
      conflicts: [],
      counts: { childChoice: 0, villagerRelationships: 0 },
      villagerRelationships: { adeline: "married" },
    });
  });

  it("applies an incoming marriage and its child choice when no local spouse exists", () => {
    const result = mergeHousehold(
      { childChoice: "undeclared", villagerRelationships: rels({ celine: "proposed" }) },
      { childChoice: "no", villagerRelationships: rels({ adeline: "married" }) },
    );

    expect(result.villagerRelationships[ADELINE]).toBe("married");
    expect(result.villagerRelationships[CELINE]).toBe("platonic");
    expect(result.childChoice).toBe("no");
    expect(result.counts).toEqual({ childChoice: 1, villagerRelationships: 1 });
    expect(result.conflicts).toEqual([]);
  });

  it("reports one spouse conflict and skips the incoming child choice", () => {
    const result = mergeHousehold(
      { childChoice: "undeclared", villagerRelationships: rels({ adeline: "married" }) },
      { childChoice: "yes", villagerRelationships: rels({ balor: "married" }) },
    );

    expect(result.conflicts).toEqual([
      { incomingVillagerId: BALOR, kind: "spouse", localVillagerId: ADELINE },
    ]);
    expect(result.villagerRelationships[ADELINE]).toBe("married");
    expect(result.childChoice).toBe("undeclared");
  });

  it("moves forward within a branch and flags a move between branches", () => {
    const result = mergeHousehold(
      {
        childChoice: "undeclared",
        villagerRelationships: rels({ adeline: "romantic", balor: "platonic" }),
      },
      { villagerRelationships: rels({ adeline: "proposed", balor: "romantic" }) },
    );

    expect(result.villagerRelationships).toEqual({ adeline: "proposed", balor: "platonic" });
    expect(result.counts.villagerRelationships).toBe(1);
    expect(result.conflicts).toEqual([
      {
        incomingRelationship: "romantic",
        kind: "relationship",
        localRelationship: "platonic",
        villagerId: BALOR,
      },
    ]);
  });

  it("does not mutate the local household", () => {
    const localRelationships = rels({ celine: "proposed" });

    mergeHousehold(
      { childChoice: "undeclared", villagerRelationships: localRelationships },
      { villagerRelationships: rels({ adeline: "married" }) },
    );

    expect(localRelationships).toEqual({ celine: "proposed" });
  });
});
