import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { recordKeys } from "$lib/utils.js";

import { decodeTransferPayload, encodeTransferPayload, TRANSFER_VERSION } from "../transfer.js";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type {
  AnimalVariantId,
  CosmeticId,
  DateId,
  NpcId,
  PetCosmeticSetId,
  PetSkinId,
  SkillId,
} from "$lib/types/tracker-data.js";

// A payload encoded with the v1 codec (no perk bitfield, no married-NPC byte) for a state with
// mines.floor = 5, npcLevels.adeline = 3, renown = 10, and all other fields empty. Used to verify
// the v2 decoder remains backward compatible with payloads generated before this change.
// cspell:disable-next-line
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
    dates: new Set(),
    hasUpperFloor: false,
    marriedNpc: null,
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    npcLevels: {},
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    romanticNpcs: new Set(),
    skillLevels: {},
    unlockedPerks: new Set(),
    ...overrides,
  };
}

describe("transfer codec v5", () => {
  it("has version 5", () => {
    expect(TRANSFER_VERSION).toBe(5);
  });

  it("round-trips unlockedPerks", async () => {
    const perkIds = recordKeys(trackerData.skills["cooking" as SkillId].perkTiers[0]);
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

  it("round-trips petCosmetics", async () => {
    const petCosmeticIds = Object.keys(trackerData.pets.cosmetics).slice(
      0,
      3,
    ) as PetCosmeticSetId[];
    const completed = makeCompleted({ petCosmetics: new Set(petCosmeticIds) });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.petCosmetics).toEqual(new Set(petCosmeticIds));
  });

  it("round-trips petSkins", async () => {
    const petSkinIds = Object.keys(trackerData.pets.skins).slice(0, 3) as PetSkinId[];
    const completed = makeCompleted({ petSkins: new Set(petSkinIds) });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.petSkins).toEqual(new Set(petSkinIds));
  });

  it("round-trips dates", async () => {
    const dateIds = Object.keys(trackerData.dates).slice(0, 3) as DateId[];
    const completed = makeCompleted({ dates: new Set(dateIds) });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.dates).toEqual(new Set(dateIds));
  });

  it("round-trips hasUpperFloor", async () => {
    const completed = makeCompleted({ hasUpperFloor: true });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.hasUpperFloor).toBe(true);
  });

  it("round-trips reachedSeason", async () => {
    for (const season of ["spring", "summer", "fall", "winter"] as const) {
      const completed = makeCompleted({ reachedSeason: season });
      const payload = await encodeTransferPayload(completed);
      const decoded = await decodeTransferPayload(payload);
      expect(decoded.reachedSeason).toBe(season);
    }
  });

  it("round-trips romanticNpcs", async () => {
    const dateableNpcs = (Object.keys(trackerData.npcs) as NpcId[]).filter(
      (id) => trackerData.npcs[id].dateable,
    );
    const subset = new Set(dateableNpcs.slice(0, 3));
    const completed = makeCompleted({ romanticNpcs: subset });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.romanticNpcs).toEqual(subset);
  });

  it("decodes v1 payload without perks, marriedNpc, pet, date, or progression fields", async () => {
    const decoded = await decodeTransferPayload(V1_FIXTURE);
    expect(decoded.unlockedPerks).toEqual(new Set());
    expect(decoded.marriedNpc).toBeNull();
    expect(decoded.petCosmetics).toEqual(new Set());
    expect(decoded.petSkins).toEqual(new Set());
    expect(decoded.dates).toEqual(new Set());
    expect(decoded.hasUpperFloor).toBe(false);
    expect(decoded.reachedSeason).toBe("spring");
    expect(decoded.romanticNpcs).toEqual(new Set());
    expect(decoded.mines?.floor).toBe(5);
    expect(decoded.npcLevels?.["adeline" as NpcId]).toBe(3);
    expect(decoded.renown).toBe(10);
  });

  it("rejects unsupported versions", async () => {
    await expect(decodeTransferPayload("not-a-valid-payload")).rejects.toThrow();
  });
});
