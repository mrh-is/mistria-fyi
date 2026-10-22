import { describe, expect, it } from "vitest";

import {
  applyEngagementCascade,
  getPartnerId,
  getSpouseId,
  isRomantic,
  mergeHousehold,
  relationshipPresentation,
} from "./relationships.js";

import type { VillagerId, VillagerRelationship } from "#lib/types/tracker-data.js";

function rels(
  obj: Record<string, VillagerRelationship>,
): Partial<Record<VillagerId, VillagerRelationship>> {
  return obj;
}

// ─── getSpouseId ────────────────────────────────────────────────

describe("getSpouseId", () => {
  it("returns null when no Villager is married", () => {
    expect(getSpouseId({})).toBeNull();
  });

  it("returns null when all relationships are non-married", () => {
    expect(
      getSpouseId(rels({ adeline: "romantic", balor: "platonic", celine: "proposed" })),
    ).toBeNull();
  });

  it("returns the married Villager ID", () => {
    expect(getSpouseId(rels({ adeline: "married", balor: "platonic" }))).toBe("adeline");
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

// ─── applyEngagementCascade ───────────────────────────────────────

describe("applyEngagementCascade", () => {
  it.each(["proposed", "married"] as const)(
    "ends other romances at %s without deciding missing paths",
    (partner) => {
      const input = rels({ adeline: partner, balor: "romantic", celine: "undecided" });
      applyEngagementCascade(input, false);
      expect(input).toEqual({ adeline: partner, balor: "platonic", celine: "undecided" });
    },
  );

  it("preserves dating when break-ups are disabled", () => {
    const input = rels({ adeline: "married", balor: "romantic" });
    applyEngagementCascade(input, true);
    expect(input).toEqual({ adeline: "married", balor: "romantic" });
  });

  it("prefers the spouse over a stale engagement", () => {
    expect(getPartnerId(rels({ adeline: "married", balor: "proposed" }))).toBe("adeline");
    expect(getPartnerId(rels({ balor: "proposed" }))).toBe("balor");
    expect(getPartnerId(rels({ balor: "romantic" }))).toBeNull();
  });
});

describe("relationshipPresentation", () => {
  const villagerId = "adeline" as VillagerId;

  it.each([false, true])(
    "keeps undecided paths available with another partner (disabled=%s)",
    (breakUpsDisabled) => {
      const presentation = relationshipPresentation({
        breakUpsDisabled,
        childChoice: "undeclared",
        level: 8,
        partnerVillager: "balor" as VillagerId,
        relationship: "undecided",
        villagerId,
      });
      expect(presentation.actions).toEqual(
        breakUpsDisabled ? ["platonic", "romantic"] : ["platonic"],
      );
      expect(presentation.status).toBe("path_not_chosen");
    },
  );

  it("omits the proposal warning with break-ups disabled", () => {
    expect(
      relationshipPresentation({
        breakUpsDisabled: true,
        childChoice: "undeclared",
        level: 10,
        partnerVillager: null,
        relationship: "romantic",
        villagerId,
      }),
    ).toMatchObject({ actions: ["proposed"], showsProposalWarning: false });
  });

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
      level: 10,
      relationship: "undecided",
      status: "path_not_chosen",
    },
    {
      actions: [],
      childChoice: "undeclared",
      level: 10,
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
      level: 10,
      relationship: "married",
      status: "married",
    },
    {
      actions: [],
      childChoice: "yes",
      level: 10,
      relationship: "married",
      status: "married_kids",
    },
    {
      actions: [],
      childChoice: "no",
      level: 10,
      relationship: "married",
      status: "married_child_free",
    },
  ] as const)(
    "projects $relationship at level $level with household choice $childChoice",
    ({ actions, childChoice, level, relationship, status }) => {
      const presentation = relationshipPresentation({
        breakUpsDisabled: false,
        childChoice,
        level,
        partnerVillager: relationship === "married" ? villagerId : null,
        relationship,
        villagerId,
      });

      expect(presentation.status).toBe(status);
      expect(presentation.actions).toEqual(actions);
    },
  );

  it("associates a warning with the proposal action", () => {
    const presentation = relationshipPresentation({
      breakUpsDisabled: false,
      childChoice: "undeclared",
      level: 10,
      partnerVillager: null,
      relationship: "romantic",
      villagerId,
    });

    expect(presentation.showsProposalWarning).toBe(true);
    expect(presentation.actions).toEqual(["proposed"]);
  });

  it("closes romantic actions when another Villager is married", () => {
    expect(
      relationshipPresentation({
        breakUpsDisabled: false,
        childChoice: "undeclared",
        level: 10,
        partnerVillager: "celine" as VillagerId,
        relationship: "romantic",
        villagerId,
      }),
    ).toMatchObject({ actions: [], status: "dating" });
  });
});

// ─── mergeHousehold ───────────────────────────────────────────────

describe("mergeHousehold", () => {
  const ADELINE = "adeline" as VillagerId;
  const BALOR = "balor" as VillagerId;
  const CELINE = "celine" as VillagerId;

  it("preserves romances alongside a newly imported spouse when break-ups are disabled", () => {
    const result = mergeHousehold(
      {
        breakUpsDisabled: false,
        childChoice: "undeclared",
        villagerRelationships: rels({ balor: "romantic" }),
      },
      {
        breakUpsDisabled: true,
        villagerRelationships: rels({ adeline: "married", celine: "romantic" }),
      },
    );
    expect(result.villagerRelationships).toEqual({
      adeline: "married",
      balor: "romantic",
      celine: "romantic",
    });
    expect(result.breakUpsDisabled).toBe(true);
    expect(result.counts.breakUpsDisabled).toBe(1);
    expect(result.conflicts).toEqual([]);
  });

  it("repairs old cascades only when the imported setting corrects an existing partner's household", () => {
    const local = {
      breakUpsDisabled: false,
      childChoice: "undeclared" as const,
      villagerRelationships: rels({ adeline: "married", balor: "platonic" }),
    };
    const incoming = {
      breakUpsDisabled: true,
      villagerRelationships: rels({ adeline: "married", balor: "romantic" }),
    };
    expect(mergeHousehold(local, incoming)).toMatchObject({
      conflicts: [],
      villagerRelationships: { balor: "romantic" },
    });
    expect(mergeHousehold({ ...local, breakUpsDisabled: true }, incoming).conflicts).toHaveLength(
      1,
    );
    expect(local.villagerRelationships[BALOR]).toBe("platonic");
  });

  it("applies a setting-only import and cascades when break-ups are turned back on", () => {
    const result = mergeHousehold(
      {
        breakUpsDisabled: true,
        childChoice: "undeclared",
        villagerRelationships: rels({ adeline: "proposed", balor: "romantic" }),
      },
      { breakUpsDisabled: false },
    );
    expect(result.villagerRelationships).toEqual({ adeline: "proposed", balor: "platonic" });
    expect(result.counts.breakUpsDisabled).toBe(1);
  });

  it("leaves the household unchanged when nothing comes in", () => {
    const local = {
      breakUpsDisabled: false,
      childChoice: "yes" as const,
      villagerRelationships: rels({ adeline: "married" }),
    };

    expect(mergeHousehold(local, {})).toEqual({
      breakUpsDisabled: false,
      childChoice: "yes",
      conflicts: [],
      counts: { breakUpsDisabled: 0, childChoice: 0, villagerRelationships: 0 },
      villagerRelationships: { adeline: "married" },
    });
  });

  it("applies an incoming marriage and its child choice when no local spouse exists", () => {
    const result = mergeHousehold(
      {
        breakUpsDisabled: false,
        childChoice: "undeclared",
        villagerRelationships: rels({ celine: "proposed" }),
      },
      {
        breakUpsDisabled: false,
        childChoice: "no",
        villagerRelationships: rels({ adeline: "married" }),
      },
    );

    expect(result.villagerRelationships[ADELINE]).toBe("married");
    expect(result.villagerRelationships[CELINE]).toBe("platonic");
    expect(result.childChoice).toBe("no");
    expect(result.counts).toEqual({
      breakUpsDisabled: 0,
      childChoice: 1,
      villagerRelationships: 1,
    });
    expect(result.conflicts).toEqual([]);
  });

  it("reports one spouse conflict and skips the incoming child choice", () => {
    const result = mergeHousehold(
      {
        breakUpsDisabled: false,
        childChoice: "undeclared",
        villagerRelationships: rels({ adeline: "married" }),
      },
      {
        breakUpsDisabled: false,
        childChoice: "yes",
        villagerRelationships: rels({ balor: "married" }),
      },
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
        breakUpsDisabled: false,
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
      {
        breakUpsDisabled: false,
        childChoice: "undeclared",
        villagerRelationships: localRelationships,
      },
      { villagerRelationships: rels({ adeline: "married" }) },
    );

    expect(localRelationships).toEqual({ celine: "proposed" });
  });
});
