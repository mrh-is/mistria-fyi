import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";

import { getMarriedNpc, isRomantic, normalizeRelationships } from "../relationships.js";

import type { NpcId, NpcRelationship } from "$lib/types/tracker-data.js";

function rels(obj: Record<string, NpcRelationship>): Partial<Record<NpcId, NpcRelationship>> {
  return obj;
}

// ─── getMarriedNpc ────────────────────────────────────────────────

describe("getMarriedNpc", () => {
  it("returns null when no NPC is married", () => {
    expect(getMarriedNpc({})).toBeNull();
  });

  it("returns null when all relationships are non-married", () => {
    expect(
      getMarriedNpc(rels({ adeline: "romantic", balor: "platonic", celine: "proposed" })),
    ).toBeNull();
  });

  it("returns the married NPC ID", () => {
    expect(getMarriedNpc(rels({ adeline: "married", balor: "platonic" }))).toBe("adeline");
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
    expect(isRomantic(r, "adeline" as NpcId)).toBe(true);
  });

  it("returns true for proposed", () => {
    expect(isRomantic(r, "balor" as NpcId)).toBe(true);
  });

  it("returns true for married", () => {
    expect(isRomantic(r, "caldarus" as NpcId)).toBe(true);
  });

  it("returns false for platonic", () => {
    expect(isRomantic(r, "celine" as NpcId)).toBe(false);
  });

  it("returns false for undecided (absent)", () => {
    expect(isRomantic(r, "juniper" as NpcId)).toBe(false);
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

  it("forces all other dateable NPCs to platonic when one is married", () => {
    const input = rels({ adeline: "married", balor: "romantic" });
    normalizeRelationships(input);
    expect(input["adeline" as NpcId]).toBe("married");
    expect(input["balor" as NpcId]).toBe("platonic");
  });

  it("adds platonic for dateable NPCs not yet in the map", () => {
    const input = rels({ adeline: "married" });
    normalizeRelationships(input);

    const dateableNpcs = Object.entries(trackerData.npcs)
      .filter(([, npc]) => npc.dateable)
      .map(([id]) => id as NpcId);

    for (const npcId of dateableNpcs) {
      if (npcId === ("adeline" as NpcId)) {
        expect(input[npcId]).toBe("married");
      } else {
        expect(input[npcId]).toBe("platonic");
      }
    }
  });
});
