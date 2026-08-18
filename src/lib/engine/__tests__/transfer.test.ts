import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";

import { decodeTransferPayload, encodeTransferPayload, TRANSFER_VERSION } from "../transfer.js";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type { CosmeticId, NpcId, PerkId, AnimalVariantId } from "$lib/types/tracker-data.js";

// A payload encoded with the v1 codec (no perk bitfield, no married-NPC byte) for a state with
// mines.floor = 5, npcLevels.adeline = 3, renown = 10, and all other fields empty. Used to verify
// the v2 decoder remains backward compatible with payloads generated before this change.
const V1_FIXTURE = "AWNgGAVUBqwMXAYDZDUA";

// Helper to create a minimal CompletedState for testing
function makeCompleted(overrides: Partial<CompletedState> = {}): CompletedState {
  const animals: Record<string, Set<AnimalVariantId>> = {};
  const animalCosmetics: Record<string, Set<CosmeticId>> = {};
  for (const animalId of Object.keys(trackerData.animals)) {
    animals[animalId] = new Set();
    animalCosmetics[animalId] = new Set();
  }
  return {
    almanac: new Set(),
    almanacRecipes: new Set(),
    animalCosmetics,
    animals,
    cosmetics: new Set(),
    marriedNpc: null,
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    npcLevels: {},
    questStates: {},
    renown: 0,
    skillLevels: {},
    unlockedPerks: new Set(),
    ...overrides,
  };
}

describe("transfer codec v2", () => {
  it("has version 2", () => {
    expect(TRANSFER_VERSION).toBe(2);
  });

  it("round-trips unlockedPerks", async () => {
    const perkIds = (Object.keys(trackerData.perks) as PerkId[]).slice(0, 2);
    const completed = makeCompleted({ unlockedPerks: new Set(perkIds) });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.unlockedPerks).toEqual(new Set(perkIds));
  });

  it("round-trips marriedNpc", async () => {
    const npcId = Object.keys(trackerData.npcs)[0] as NpcId;
    const completed = makeCompleted({ marriedNpc: npcId });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.marriedNpc).toBe(npcId);
  });

  it("round-trips null marriedNpc", async () => {
    const completed = makeCompleted({ marriedNpc: null });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.marriedNpc).toBeNull();
  });

  it("decodes v1 payload without perks or marriedNpc", async () => {
    const decoded = await decodeTransferPayload(V1_FIXTURE);
    expect(decoded.unlockedPerks).toEqual(new Set());
    expect(decoded.marriedNpc).toBeNull();
    // Sanity check that pre-existing v1 fields still decode correctly.
    expect(decoded.mines?.floor).toBe(5);
    expect(decoded.npcLevels?.adeline).toBe(3);
    expect(decoded.renown).toBe(10);
  });

  it("rejects unsupported versions", async () => {
    await expect(decodeTransferPayload("not-a-valid-payload")).rejects.toThrow();
  });
});
