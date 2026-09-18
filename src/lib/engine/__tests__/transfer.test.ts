import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { recordEntries, recordKeys, recordValues } from "$lib/utils.js";

import { decodeTransferPayload, encodeTransferPayload, TRANSFER_VERSION } from "../transfer";

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

// A payload encoded with the v8 codec. Contains maximum scalar values, a marriage relationship,
// one recipe, and all other collection fields empty. This fixture protects the current layout from
// accidental reinterpretation while the generated tracker data remains compatible.
// cspell:disable-next-line
const V8_BOUNDARY_FIXTURE = "CGNgGAVUBv_xgYFzVgNDyyRPlQkMDvS0FAA";

async function compressTransferRaw(version: number, raw: Uint8Array): Promise<string> {
  const stream = new CompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  await writer.write(raw as Uint8Array<ArrayBuffer>);
  await writer.close();
  const compressed = new Uint8Array(await new Response(stream.readable).arrayBuffer());
  return toBase64url(new Uint8Array([version, ...compressed]));
}

async function decompressTransferRaw(payload: string): Promise<Uint8Array> {
  const bytes = fromBase64url(payload);
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  await writer.write(bytes.slice(1));
  await writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

function fromBase64url(payload: string): Uint8Array {
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

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

function toBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("transfer codec v8", () => {
  it("has version 8", () => {
    expect(TRANSFER_VERSION).toBe(8);
  });

  it("round-trips maximum scalar and packed relationship values", async () => {
    const npcIds = recordKeys(trackerData.npcs);
    const skillIds = recordKeys(trackerData.skills);
    const dateableNpcs = npcIds.filter((id) => trackerData.npcs[id].dateable);
    const npcRelationships: Partial<Record<NpcId, NpcRelationship>> = {};
    for (const npcId of dateableNpcs) npcRelationships[npcId] = "platonic";
    npcRelationships[dateableNpcs[0]] = "married";
    const completed = makeCompleted({
      mines: { floor: 0xff, spells: new Set() },
      npcLevels: Object.fromEntries(npcIds.map((id) => [id, 0xf])),
      npcRelationships,
      renown: 0xffff,
      skillLevels: Object.fromEntries(skillIds.map((id) => [id, 0xff])),
    });

    const decoded = await decodeTransferPayload(await encodeTransferPayload(completed));

    expect(decoded.mines?.floor).toBe(0xff);
    expect(decoded.npcLevels).toEqual(completed.npcLevels);
    expect(decoded.npcRelationships).toEqual(npcRelationships);
    expect(decoded.renown).toBe(0xffff);
    expect(decoded.skillLevels).toEqual(completed.skillLevels);
  });

  it("round-trips every transferable completion without loss", async () => {
    const completed = makeCompleted({
      almanac: new Set(
        recordValues(trackerData.almanac).flatMap(({ items }) =>
          items.map((entry) => entry.itemIds[0]),
        ),
      ),
      almanacRecipes: new Set(recordKeys(trackerData.recipes)),
      childChoice: "yes",
      cosmetics: new Set(
        recordEntries(trackerData.cosmetics)
          .filter(([, cosmetic]) => !cosmetic.sources.some((source) => source.type === "default"))
          .map(([id]) => id),
      ),
      dates: new Set(recordKeys(trackerData.dates)),
      hasUpperFloor: true,
      mines: { floor: 0xff, spells: new Set(recordKeys(trackerData.mines.spells)) },
      museum: new Set(
        recordValues(trackerData.museum).flatMap(({ sets }) =>
          recordValues(sets).flatMap(({ items }) => items),
        ),
      ),
      npcLevels: Object.fromEntries(recordKeys(trackerData.npcs).map((id) => [id, 0xf])),
      petCosmetics: new Set(recordKeys(trackerData.pets.cosmetics)),
      petSkins: new Set(recordKeys(trackerData.pets.skins)),
      questStates: Object.fromEntries(
        recordValues(trackerData.quests).flatMap((quests) =>
          recordKeys(quests).map((id) => [id, "completed"]),
        ),
      ),
      reachedSeason: "winter",
      renown: 0xffff,
      skillLevels: Object.fromEntries(recordKeys(trackerData.skills).map((id) => [id, 0xff])),
      unlockedPerks: new Set(
        recordValues(trackerData.skills).flatMap((skill) =>
          skill.perkTiers.flatMap((tier) => recordKeys(tier)),
        ),
      ),
    });
    for (const [animalId, animal] of recordEntries(trackerData.animals)) {
      completed.animalCosmetics[animalId] = new Set(recordKeys(animal.cosmetics));
      completed.animals[animalId] = new Set(
        animal.variantTiers.flatMap((tier) =>
          recordEntries(tier)
            .filter(([, variant]) => variant.source.type !== "default")
            .map(([id]) => id),
        ),
      );
    }
    const dateableNpcs = recordKeys(trackerData.npcs).filter((id) => trackerData.npcs[id].dateable);
    completed.npcRelationships = Object.fromEntries(dateableNpcs.map((id) => [id, "platonic"]));
    completed.npcRelationships[dateableNpcs[0]] = "married";

    const decoded = await decodeTransferPayload(await encodeTransferPayload(completed));

    expect(decoded).toEqual({
      ...completed,
      almanac: new Set(completed.almanac),
      animalCosmetics: Object.fromEntries(
        recordEntries(completed.animalCosmetics).filter(([, ids]) => ids.size > 0),
      ),
      animals: Object.fromEntries(
        recordEntries(completed.animals).filter(([, ids]) => ids.size > 0),
      ),
    });
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

  it("decodes the current v8 boundary fixture", async () => {
    const npcIds = recordKeys(trackerData.npcs);
    const dateableNpcs = npcIds.filter((id) => trackerData.npcs[id].dateable);
    const recipeId = recordKeys(trackerData.recipes)[0];
    const relationships = Object.fromEntries(dateableNpcs.map((id) => [id, "platonic"])) as Partial<
      Record<NpcId, NpcRelationship>
    >;
    relationships[dateableNpcs[0]] = "married";
    const fixtureState = makeCompleted({
      almanacRecipes: new Set([recipeId]),
      mines: { floor: 0xff, spells: new Set() },
      npcLevels: Object.fromEntries(npcIds.map((id) => [id, 0xf])),
      npcRelationships: relationships,
      renown: 0xffff,
      skillLevels: Object.fromEntries(recordKeys(trackerData.skills).map((id) => [id, 0xff])),
    });
    expect(await encodeTransferPayload(fixtureState)).toBe(V8_BOUNDARY_FIXTURE);

    const decoded = await decodeTransferPayload(V8_BOUNDARY_FIXTURE);
    const marriedNpc = recordKeys(trackerData.npcs).find(
      (id) => decoded.npcRelationships?.[id] === "married",
    );

    expect(decoded.mines?.floor).toBe(0xff);
    expect(decoded.renown).toBe(0xffff);
    expect(new Set(Object.values(decoded.npcLevels ?? {}))).toEqual(new Set([0xf]));
    expect(new Set(Object.values(decoded.skillLevels ?? {}))).toEqual(new Set([0xff]));
    expect(marriedNpc).toBeDefined();
    expect(decoded.almanacRecipes?.size).toBe(1);
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

  it("round-trips empty almanacRecipes", async () => {
    const completed = makeCompleted({ almanacRecipes: new Set() });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.almanacRecipes).toEqual(new Set());
  });

  it("round-trips fully completed almanacRecipes", async () => {
    const allRecipeIds = Object.keys(trackerData.recipes) as RecipeId[];
    const completed = makeCompleted({ almanacRecipes: new Set(allRecipeIds) });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.almanacRecipes).toEqual(new Set(allRecipeIds));
  });

  it("round-trips partial almanacRecipes", async () => {
    const recipeIds = Object.keys(trackerData.recipes) as RecipeId[];
    const partial = new Set(recipeIds.filter((_, i) => i % 2 === 0));
    const completed = makeCompleted({ almanacRecipes: partial });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.almanacRecipes).toEqual(partial);
  });

  // The v1 fixture (line 25) exercises the pre-v8 path where almanacRecipes is absent:
  // the decoder defaults it to an empty set. This covers all pre-v8 versions (1-7) because
  // the recipe bitfield was added in v8 and the `version >= 8` guard is the sole branch.
  it("defaults almanacRecipes to empty for all pre-v8 versions", async () => {
    const decodedV1 = await decodeTransferPayload(V1_FIXTURE);
    expect(decodedV1.almanacRecipes).toEqual(new Set());

    const decodedV5 = await decodeTransferPayload(V5_ALMANAC_FIXTURE);
    expect(decodedV5.almanacRecipes).toEqual(new Set());
  });

  it.each(["", "not+a/valid=payload", "A", "%%%%"])(
    "rejects malformed base64url envelope %j",
    async (payload) => {
      await expect(decodeTransferPayload(payload)).rejects.toThrow(/transfer payload/i);
    },
  );

  it.each([
    ["version zero", toBase64url(new Uint8Array([0]))],
    ["future version", toBase64url(new Uint8Array([TRANSFER_VERSION + 1]))],
  ])("rejects unsupported %s", async (_, payload) => {
    await expect(decodeTransferPayload(payload)).rejects.toThrow(/unsupported transfer version/i);
  });

  it("rejects a missing compressed body", async () => {
    await expect(
      decodeTransferPayload(toBase64url(new Uint8Array([TRANSFER_VERSION]))),
    ).rejects.toThrow(/compressed transfer payload/i);
  });

  it("rejects truncated compressed data", async () => {
    const payload = await encodeTransferPayload(makeCompleted());
    const truncated = toBase64url(fromBase64url(payload).slice(0, -1));
    await expect(decodeTransferPayload(truncated)).rejects.toThrow(/compressed transfer payload/i);
  });

  it("rejects malformed compressed data", async () => {
    const payload = toBase64url(new Uint8Array([TRANSFER_VERSION, 0, 1, 2, 3]));
    await expect(decodeTransferPayload(payload)).rejects.toThrow(/compressed transfer payload/i);
  });

  it.each(["truncated", "trailing"])("rejects %s decompressed data", async (kind) => {
    const payload = await encodeTransferPayload(makeCompleted());
    const raw = await decompressTransferRaw(payload);
    const malformed = kind === "truncated" ? raw.slice(0, -1) : new Uint8Array([...raw, 0]);
    const malformedPayload = await compressTransferRaw(TRANSFER_VERSION, malformed);

    await expect(decodeTransferPayload(malformedPayload)).rejects.toThrow(/length/i);
  });
});
