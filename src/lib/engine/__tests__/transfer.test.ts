import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { recordKeys, recordValues } from "$lib/utils.js";

import { decodeTransferPayload, encodeTransferPayload, TRANSFER_VERSION } from "../transfer.js";

import type { CompletedState } from "$lib/stores/user-state.svelte.js";
import type {
  AnimalVariantId,
  CosmeticId,
  DateId,
  NpcId,
  NpcRelationship,
  PetCosmeticSetId,
  PetSkinId,
  RecipeId,
  SkillId,
} from "$lib/types/tracker-data.js";

// A payload encoded with the v1 codec (no perk bitfield, no married-NPC byte) for a state with
// mines.floor = 5, npcLevels.adeline = 3, renown = 10, and all other fields empty. Used to verify
// the v2 decoder remains backward compatible with payloads generated before this change.
// cspell:disable-next-line
const V1_FIXTURE = "AWNgGAVUBqwMXAYDZDUA";

// A payload encoded with the v5 codec using the pre-v6 almanac ordering. Contains two almanac
// completions: bakery_bread_basket_pastel (old canonical, now bakery_bread_basket_coffee) and
// animated_waterfall_v1 (unchanged canonical). All other fields are empty/zero.
// cspell:disable-next-line
const V5_ALMANAC_FIXTURE = "BWNgoBXgQOE10MyeUTAKqA0A";

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
    childChoice: "undeclared",
    cosmetics: new Set(),
    dates: new Set(),
    hasUpperFloor: false,
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    npcLevels: {},
    npcRelationships: {},
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    unlockedPerks: new Set(),
    ...overrides,
  };
}

describe("transfer codec v8", () => {
  it("has version 8", () => {
    expect(TRANSFER_VERSION).toBe(8);
  });

  it("round-trips unlockedPerks", async () => {
    const perkIds = recordKeys(trackerData.skills["cooking" as SkillId].perkTiers[0]);
    const completed = makeCompleted({ unlockedPerks: new Set(perkIds) });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.unlockedPerks).toEqual(new Set(perkIds));
  });

  it("round-trips married NPC via npcRelationships", async () => {
    const dateableNpcs = (Object.keys(trackerData.npcs) as NpcId[]).filter(
      (id) => trackerData.npcs[id].dateable,
    );
    const npcId = dateableNpcs[0];
    const relationships: Partial<Record<NpcId, NpcRelationship>> = { [npcId]: "married" };
    for (const other of dateableNpcs.slice(1)) {
      relationships[other] = "platonic";
    }
    const completed = makeCompleted({ npcRelationships: relationships });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.npcRelationships?.[npcId]).toBe("married");
  });

  it("round-trips no married NPC", async () => {
    const completed = makeCompleted({ npcRelationships: {} });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    const married = Object.entries(decoded.npcRelationships ?? {}).find(([, r]) => r === "married");
    expect(married).toBeUndefined();
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

  it("round-trips npcRelationships", async () => {
    const dateableNpcs = (Object.keys(trackerData.npcs) as NpcId[]).filter(
      (id) => trackerData.npcs[id].dateable,
    );
    const relationships: Partial<Record<NpcId, NpcRelationship>> = {};
    relationships[dateableNpcs[0]] = "romantic";
    relationships[dateableNpcs[1]] = "proposed";
    relationships[dateableNpcs[2]] = "platonic";
    const completed = makeCompleted({ npcRelationships: relationships });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.npcRelationships?.[dateableNpcs[0]]).toBe("romantic");
    expect(decoded.npcRelationships?.[dateableNpcs[1]]).toBe("proposed");
    expect(decoded.npcRelationships?.[dateableNpcs[2]]).toBe("platonic");
  });

  it("round-trips childChoice", async () => {
    for (const choice of ["undeclared", "yes", "no"] as const) {
      const completed = makeCompleted({ childChoice: choice });
      const payload = await encodeTransferPayload(completed);
      const decoded = await decodeTransferPayload(payload);
      expect(decoded.childChoice).toBe(choice);
    }
  });

  it("round-trips almanacRecipes", async () => {
    const recipeIds = (Object.keys(trackerData.recipes) as RecipeId[]).slice(0, 3);
    const completed = makeCompleted({ almanacRecipes: new Set(recipeIds) });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.almanacRecipes).toEqual(new Set(recipeIds));
  });

  it("decodes v1 payload without perks, relationships, pet, date, or progression fields", async () => {
    const decoded = await decodeTransferPayload(V1_FIXTURE);
    expect(decoded.unlockedPerks).toEqual(new Set());
    expect(decoded.npcRelationships).toEqual({});
    expect(decoded.petCosmetics).toEqual(new Set());
    expect(decoded.petSkins).toEqual(new Set());
    expect(decoded.dates).toEqual(new Set());
    expect(decoded.hasUpperFloor).toBe(false);
    expect(decoded.reachedSeason).toBe("spring");
    expect(decoded.childChoice).toBe("undeclared");
    expect(decoded.almanacRecipes).toEqual(new Set());
    expect(decoded.mines?.floor).toBe(5);
    expect(decoded.npcLevels?.["adeline" as NpcId]).toBe(3);
    expect(decoded.renown).toBe(10);
  });

  it("decodes v5 payload and normalizes old almanac canonicals to new", async () => {
    const decoded = await decodeTransferPayload(V5_ALMANAC_FIXTURE);
    const almanac = decoded.almanac ?? new Set();
    expect(almanac.has("bakery_bread_basket_coffee" as never)).toBe(true);
    expect(almanac.has("bakery_bread_basket_pastel" as never)).toBe(false);
    expect(almanac.has("animated_waterfall_v1" as never)).toBe(true);
    expect(almanac.size).toBe(2);
  });

  it("round-trips almanac with canonical IDs", async () => {
    const colorwayEntry = recordValues(trackerData.almanac)
      .flatMap(({ items }) => items)
      .find((entry) => entry.itemIds.length > 1);
    if (!colorwayEntry) throw new Error("expected a colorway entry in test data");
    const canonicalId = colorwayEntry.itemIds[0];
    const completed = makeCompleted({ almanac: new Set([canonicalId]) });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    const decodedAlmanac = decoded.almanac ?? new Set();
    expect(decodedAlmanac.has(canonicalId)).toBe(true);
  });

  it("uses deterministic almanac ordering derived from canonical IDs", async () => {
    const categoryCanonicalIds = recordValues(trackerData.almanac).flatMap(({ items }) =>
      items.map((entry) => entry.itemIds[0]),
    );
    const allCanonicalIds = [...new Set(categoryCanonicalIds)].toSorted();
    expect(categoryCanonicalIds.length).toBeGreaterThan(allCanonicalIds.length);
    const completed = makeCompleted({ almanac: new Set(allCanonicalIds) });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.almanac).toEqual(new Set(allCanonicalIds));
  });

  it("rejects unsupported versions", async () => {
    await expect(decodeTransferPayload("not-a-valid-payload")).rejects.toThrow();
  });
});
