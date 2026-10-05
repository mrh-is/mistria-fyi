import { describe, expect, it, vi } from "vitest";

import { trackerData, trackerIndex } from "#lib/data/index.js";
import { MAX_SKILL_LEVEL, MAX_VILLAGER_LEVEL } from "#lib/engine/progress.js";
import { recordEntries, recordKeys, recordValues } from "#lib/utils.js";

import {
  decodeTransferPayload,
  encodeTransferPayload,
  getTransferOrderingHash,
  TRANSFER_MAGIC,
  TRANSFER_ORDERING_HASH,
  TRANSFER_VERSION,
  TransferDecodeError,
} from "./transfer.js";

import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  DateId,
  ItemId,
  PerkId,
  PetCosmeticSetId,
  PetSkinId,
  QuestId,
  RecipeId,
  SkillId,
  SpellId,
  VillagerId,
  VillagerRelationship,
} from "#lib/types/tracker-data.js";
import type { CompletedState } from "#lib/types/user-progress.js";

import type { TransferDecodeErrorCode } from "./transfer.js";

const CHECKSUM_BYTE_LENGTH = 4;

// A payload encoded with the v1 codec. Kept to verify that stale positional data is rejected before
// decoding rather than being interpreted against the current tracker-data ordering.
// cspell:disable-next-line
const V1_FIXTURE = "AWNgGAVUBqwMXAYDZDUA";

// A payload encoded with the v5 codec using a historical almanac ordering. It must be rejected
// before the ordering can be interpreted as current progress.
// cspell:disable-next-line
const V5_ALMANAC_FIXTURE = "BWNgoBXgQOE10MyeUTAKqA0A";

// A payload encoded with the pre-checksum v8 codec. It represents the final pre-checksum layout and
// must be rejected before its positional fields are decoded.
// cspell:disable-next-line
const V8_BOUNDARY_FIXTURE = "CGNgGAVUBv_xgYFzVgNDyyRPlQkMDvS0FAA";

// A payload encoded with the v9 codec. It is the immediately preceding layout and must be rejected
// after the v1.0.5 tracker data changed positional orderings.
// cspell:disable-next-line
const V9_BOUNDARY_FIXTURE = "CSG9unJjYBgFVAYpDCln0IENDAycsxoYWiZ5qkxgcKCnpQA";

// A payload encoded with the v10 codec, the last layout without the transfer marker. It has v11's
// fields, so it pins that an unmarked payload is rejected as foreign rather than decoded.
// cspell:disable-next-line
const V10_UNMARKED_FIXTURE =
  "CjegUCBjYBiuwAGF10COLhZy7WYCkxwiDIJYjWAn11yircYuwKjAwCDAscCBQQDMAxEKNHQKCgAA";

// A v11 payload encoded from makeGoldenCompleted(). Unlike round-trip tests, this fixture pins the
// current wire meaning independently of the live encoder and decoder implementation.
// cspell:disable-next-line
const V11_GOLDEN_FIXTURE =
  "MFGTCzegUCBjYBiuwAGF10COLhZy7WYCkxwiDIJYjWAn11yircYuwKjAwCDAscCBQQDMAxEKNHQKCgAA";

async function compressTransferRaw(version: number, raw: Uint8Array): Promise<string> {
  const compressed = await compressRawOnly(raw);
  return marked(new Uint8Array([version, ...crc32ToBytes(crc32(raw)), ...compressed]));
}

async function expectDecodeError(
  payload: string,
  code: TransferDecodeErrorCode,
  message: RegExp,
): Promise<void> {
  const rejected: unknown = await decodeTransferPayload(payload).then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(rejected).toBeInstanceOf(TransferDecodeError);
  expect(rejected).toHaveProperty("code", code);
  expect(rejected).toHaveProperty("message", expect.stringMatching(message));
}

/** A marked payload: the transfer marker followed by the base64url bytes. */
function marked(bytes: Uint8Array): string {
  return TRANSFER_MAGIC + toBase64url(bytes);
}

/** The bytes after a payload's transfer marker. */
function unmarked(payload: string): Uint8Array {
  expect(payload.startsWith(TRANSFER_MAGIC)).toBe(true);
  return fromBase64url(payload.slice(TRANSFER_MAGIC.length));
}

// Mirrors the production CRC-32 (IEEE 802.3) implementation in transfer.ts so tests can build
// payloads with a correct, or deliberately incorrect, integrity checksum.
let testCrc32Table: null | Uint32Array = null;
async function compressRawOnly(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  await writer.write(raw as Uint8Array<ArrayBuffer>);
  await writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

function crc32(bytes: Uint8Array): number {
  if (!testCrc32Table) {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    testCrc32Table = table;
  }
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) crc = testCrc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function crc32ToBytes(checksum: number): number[] {
  return [
    (checksum >>> 24) & 0xff,
    (checksum >>> 16) & 0xff,
    (checksum >>> 8) & 0xff,
    checksum & 0xff,
  ];
}

/** Decompresses a marked transfer payload, skipping the version byte and the checksum. */
async function decompressTransferRaw(payload: string): Promise<Uint8Array> {
  const bytes = unmarked(payload);
  const bodyStart = 1 + CHECKSUM_BYTE_LENGTH;
  const stream = new DecompressionStream("deflate-raw");
  const writer = stream.writable.getWriter();
  await writer.write(bytes.slice(bodyStart));
  await writer.close();
  return new Uint8Array(await new Response(stream.readable).arrayBuffer());
}

function fromBase64url(payload: string): Uint8Array {
  const base64 = payload.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.codePointAt(0) ?? 0);
}

function bytesForBits(count: number): number {
  return Math.ceil(count / 8);
}

function getTransferFieldOffsets(): Record<
  "child" | "married" | "progression" | "quest" | "relationship" | "spell",
  number
> {
  const animalVariantCount = recordValues(trackerData.animals).reduce(
    (count, animal) =>
      count +
      animal.variantTiers.reduce(
        (tierCount, tier) =>
          tierCount +
          recordValues(tier).filter((variant) => variant.source.type !== "default").length,
        0,
      ),
    0,
  );
  const animalCosmeticCount = recordValues(trackerData.animals).reduce(
    (count, animal) => count + recordKeys(animal.cosmetics).length,
    0,
  );
  const museumCount = recordValues(trackerData.museum).reduce(
    (count, wing) =>
      count + recordValues(wing.sets).reduce((setCount, set) => setCount + set.items.length, 0),
    0,
  );
  const questCount = recordValues(trackerData.quests).reduce(
    (count, quests) => count + recordKeys(quests).length,
    0,
  );
  const perkCount = recordValues(trackerData.skills).reduce(
    (count, skill) =>
      count + skill.perkTiers.reduce((tierCount, tier) => tierCount + recordKeys(tier).length, 0),
    0,
  );
  const dateableCount = recordValues(trackerData.villagers).filter(
    (villager) => villager.dateable,
  ).length;

  let offset =
    bytesForBits(trackerIndex.uniqueAlmanacCanonicalIds.length) +
    bytesForBits(
      recordValues(trackerData.cosmetics).filter(
        (cosmetic) => !cosmetic.sources.some((source) => source.type === "default"),
      ).length,
    ) +
    bytesForBits(animalVariantCount) +
    bytesForBits(animalCosmeticCount) +
    bytesForBits(museumCount);
  const spell = offset;
  offset += 1 + 1 + 2 + bytesForBits(recordKeys(trackerData.villagers).length * 4);
  offset += recordKeys(trackerData.skills).length;
  const quest = offset;
  offset += bytesForBits(questCount * 2) + bytesForBits(perkCount);
  const married = offset;
  offset +=
    1 +
    bytesForBits(recordKeys(trackerData.pets.cosmetics).length) +
    bytesForBits(recordKeys(trackerData.pets.skins).length) +
    bytesForBits(recordKeys(trackerData.dates).length);
  const progression = offset;
  offset += 1 + bytesForBits(dateableCount);
  const relationship = offset;
  offset += bytesForBits(dateableCount * 3);
  const child = offset;

  return { child, married, progression, quest, relationship, spell };
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
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    unlockedPerks: new Set(),
    villagerLevels: {},
    villagerRelationships: {},
    ...overrides,
  };
}

function makeGoldenCompleted(): CompletedState {
  const chicken = "chicken" as AnimalId;
  const completed = makeCompleted({
    almanac: new Set(["turnip" as ItemId]),
    almanacRecipes: new Set(["basic_wood_chest" as RecipeId]),
    childChoice: "yes",
    cosmetics: new Set(["back_gear_ancient_witch_broom" as CosmeticId]),
    dates: new Set(["inn_meal" as DateId]),
    hasUpperFloor: true,
    mines: { floor: 20, spells: new Set(["summon_rain" as SpellId]) },
    museum: new Set(["turnip" as ItemId]),
    petCosmetics: new Set(["flower_crown" as PetCosmeticSetId]),
    petSkins: new Set(["sapling" as PetSkinId]),
    questStates: { ["repair_the_general_store" as QuestId]: "completed" },
    reachedSeason: "fall",
    renown: 17,
    skillLevels: { ["farming" as SkillId]: 7 },
    unlockedPerks: new Set(["museum_quality_one" as PerkId]),
    villagerLevels: { ["balor" as VillagerId]: 4 },
    villagerRelationships: { ["balor" as VillagerId]: "married" },
  });
  completed.animals[chicken] = new Set(["red" as AnimalVariantId]);
  completed.animalCosmetics[chicken] = new Set(["ribbon_red" as CosmeticId]);
  return completed;
}

function makeGoldenDecodedExpectation(): Partial<CompletedState> {
  const completed = makeGoldenCompleted();
  const balor = "balor" as VillagerId;
  const dateableVillagers = recordEntries(trackerData.villagers)
    .filter(([, villager]) => villager.dateable)
    .map(([id]) => id);

  return {
    ...completed,
    animalCosmetics: Object.fromEntries(
      recordEntries(completed.animalCosmetics).filter(([, ids]) => ids.size > 0),
    ),
    animals: Object.fromEntries(recordEntries(completed.animals).filter(([, ids]) => ids.size > 0)),
    questStates: Object.fromEntries(
      recordValues(trackerData.quests).flatMap((quests) =>
        recordKeys(quests).map((id) => [id, completed.questStates[id] ?? "none"]),
      ),
    ),
    skillLevels: Object.fromEntries(
      recordKeys(trackerData.skills).map((id) => [id, completed.skillLevels[id] ?? 0]),
    ),
    villagerLevels: Object.fromEntries(
      recordKeys(trackerData.villagers).map((id) => [id, completed.villagerLevels[id] ?? 0]),
    ),
    villagerRelationships: Object.fromEntries(
      dateableVillagers.map((id) => [id, id === balor ? "married" : "platonic"]),
    ),
  };
}

async function mutateEncodedRaw(
  mutate: (raw: Uint8Array, offsets: ReturnType<typeof getTransferFieldOffsets>) => void,
): Promise<string> {
  const raw = await decompressTransferRaw(await encodeTransferPayload(makeCompleted()));
  mutate(raw, getTransferFieldOffsets());
  return compressTransferRaw(TRANSFER_VERSION, raw);
}

function toBase64url(bytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

describe("transfer codec v11", () => {
  it("has version 11", () => {
    expect(TRANSFER_VERSION).toBe(11);
  });

  it("pins the v11 wire ordering hash", () => {
    expect(TRANSFER_ORDERING_HASH).toBe("50dbf1b9");
    expect(getTransferOrderingHash()).toBe(TRANSFER_ORDERING_HASH);
  });

  it("reproduces the immutable v11 golden payload", async () => {
    expect(await encodeTransferPayload(makeGoldenCompleted())).toBe(V11_GOLDEN_FIXTURE);
  });

  it("decodes the immutable v11 golden payload without changing its meaning", async () => {
    const decoded = await decodeTransferPayload(V11_GOLDEN_FIXTURE);

    expect(decoded).toEqual(makeGoldenDecodedExpectation());
  });

  it("preserves the prior English order while Lithuanian exposes the collation regression", () => {
    const chickenTier = ["gray", "red", "yellow"];
    const english = new Intl.Collator("en");
    const lithuanian = new Intl.Collator("lt");

    expect(chickenTier.toSorted((left, right) => english.compare(left, right))).toEqual(
      chickenTier,
    );
    expect(chickenTier.toSorted((left, right) => lithuanian.compare(left, right))).toEqual([
      "gray",
      "yellow",
      "red",
    ]);
  });

  it.each(["en", "lt", "sv"])(
    "encodes the golden state identically under %s collation",
    async (locale) => {
      const collator = new Intl.Collator(locale);
      const localeCompare = vi
        .spyOn(String.prototype, "localeCompare")
        .mockImplementation(function localeCompare(this: string, other) {
          return collator.compare(this, other);
        });

      try {
        expect(await encodeTransferPayload(makeGoldenCompleted())).toBe(V11_GOLDEN_FIXTURE);
      } finally {
        localeCompare.mockRestore();
      }
    },
  );

  it.each([
    ["quest state", "quest", 0xc0],
    ["spouse index", "married", recordKeys(trackerData.villagers).length],
    ["progression reserved bits", "progression", 0x01],
    ["relationship state", "relationship", 0xa0],
    ["child choice", "child", 0x03],
    ["spell reserved bits", "spell", 0x01],
  ] as const)("rejects an invalid %s", async (label, field, value) => {
    const payload = await mutateEncodedRaw((raw, offsets) => {
      raw[offsets[field]] = value;
    });

    await expectDecodeError(payload, "corrupt", new RegExp(label, "i"));
  });

  it("round-trips maximum in-domain scalar and packed relationship values", async () => {
    const villagerIds = recordKeys(trackerData.villagers);
    const skillIds = recordKeys(trackerData.skills);
    const dateableVillagers = villagerIds.filter((id) => trackerData.villagers[id].dateable);
    const villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>> = {};
    for (const villagerId of dateableVillagers) villagerRelationships[villagerId] = "platonic";
    villagerRelationships[dateableVillagers[0]] = "married";
    const maxFloor = trackerData.mines.biomes.at(-1)?.floors.end ?? 0;
    const maxRenown = trackerData.townRanks.at(-1)?.levels.end ?? 0;
    const completed = makeCompleted({
      mines: { floor: maxFloor, spells: new Set() },
      renown: maxRenown,
      skillLevels: Object.fromEntries(skillIds.map((id) => [id, MAX_SKILL_LEVEL])),
      villagerLevels: Object.fromEntries(villagerIds.map((id) => [id, MAX_VILLAGER_LEVEL])),
      villagerRelationships,
    });

    const decoded = await decodeTransferPayload(await encodeTransferPayload(completed));

    expect(decoded.mines?.floor).toBe(maxFloor);
    expect(decoded.villagerLevels).toEqual(completed.villagerLevels);
    expect(decoded.villagerRelationships).toEqual(villagerRelationships);
    expect(decoded.renown).toBe(maxRenown);
    expect(decoded.skillLevels).toEqual(completed.skillLevels);
  });

  it("clamps out-of-domain scalar values instead of trusting the encoded bit pattern", async () => {
    const villagerIds = recordKeys(trackerData.villagers);
    const skillIds = recordKeys(trackerData.skills);
    const maxFloor = trackerData.mines.biomes.at(-1)?.floors.end ?? 0;
    const maxRenown = trackerData.townRanks.at(-1)?.levels.end ?? 0;
    const completed = makeCompleted({
      mines: { floor: 0xff, spells: new Set() },
      renown: 0xff_ff,
      skillLevels: Object.fromEntries(skillIds.map((id) => [id, 0xff])),
      villagerLevels: Object.fromEntries(villagerIds.map((id) => [id, 0xf])),
    });

    const decoded = await decodeTransferPayload(await encodeTransferPayload(completed));

    expect(decoded.mines?.floor).toBe(maxFloor);
    expect(decoded.renown).toBe(maxRenown);
    for (const id of skillIds) expect(decoded.skillLevels?.[id]).toBe(MAX_SKILL_LEVEL);
    for (const id of villagerIds) expect(decoded.villagerLevels?.[id]).toBe(MAX_VILLAGER_LEVEL);
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
      mines: {
        floor: trackerData.mines.biomes.at(-1)?.floors.end ?? 0,
        spells: new Set(recordKeys(trackerData.mines.spells)),
      },
      museum: new Set(
        recordValues(trackerData.museum).flatMap(({ sets }) =>
          recordValues(sets).flatMap(({ items }) => items),
        ),
      ),
      petCosmetics: new Set(recordKeys(trackerData.pets.cosmetics)),
      petSkins: new Set(recordKeys(trackerData.pets.skins)),
      questStates: Object.fromEntries(
        recordValues(trackerData.quests).flatMap((quests) =>
          recordKeys(quests).map((id) => [id, "completed"]),
        ),
      ),
      reachedSeason: "winter",
      renown: trackerData.townRanks.at(-1)?.levels.end ?? 0,
      skillLevels: Object.fromEntries(
        recordKeys(trackerData.skills).map((id) => [id, MAX_SKILL_LEVEL]),
      ),
      unlockedPerks: new Set(
        recordValues(trackerData.skills).flatMap((skill) =>
          skill.perkTiers.flatMap((tier) => recordKeys(tier)),
        ),
      ),
      villagerLevels: Object.fromEntries(
        recordKeys(trackerData.villagers).map((id) => [id, MAX_VILLAGER_LEVEL]),
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
    const dateableVillagers = recordKeys(trackerData.villagers).filter(
      (id) => trackerData.villagers[id].dateable,
    );
    completed.villagerRelationships = Object.fromEntries(
      dateableVillagers.map((id) => [id, "platonic"]),
    );
    completed.villagerRelationships[dateableVillagers[0]] = "married";

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

  it("round-trips married Villager via villagerRelationships", async () => {
    const dateableVillagers = (Object.keys(trackerData.villagers) as VillagerId[]).filter(
      (id) => trackerData.villagers[id].dateable,
    );
    const villagerId = dateableVillagers[0];
    const relationships: Partial<Record<VillagerId, VillagerRelationship>> = {
      [villagerId]: "married",
    };
    for (const other of dateableVillagers.slice(1)) {
      relationships[other] = "platonic";
    }
    const completed = makeCompleted({ villagerRelationships: relationships });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.villagerRelationships?.[villagerId]).toBe("married");
  });

  it("round-trips no married Villager", async () => {
    const completed = makeCompleted({ villagerRelationships: {} });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    const married = Object.entries(decoded.villagerRelationships ?? {}).find(
      ([, r]) => r === "married",
    );
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

  it.each(["spring", "summer", "fall", "winter"] as const)(
    "round-trips reachedSeason %s",
    async (season) => {
      const completed = makeCompleted({ reachedSeason: season });
      const payload = await encodeTransferPayload(completed);
      const decoded = await decodeTransferPayload(payload);
      expect(decoded.reachedSeason).toBe(season);
    },
  );

  it("round-trips villagerRelationships", async () => {
    const dateableVillagers = (Object.keys(trackerData.villagers) as VillagerId[]).filter(
      (id) => trackerData.villagers[id].dateable,
    );
    const relationships: Partial<Record<VillagerId, VillagerRelationship>> = {
      [dateableVillagers[0]]: "romantic",
      [dateableVillagers[1]]: "proposed",
      [dateableVillagers[2]]: "platonic",
    };
    const completed = makeCompleted({ villagerRelationships: relationships });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.villagerRelationships?.[dateableVillagers[0]]).toBe("romantic");
    expect(decoded.villagerRelationships?.[dateableVillagers[1]]).toBe("proposed");
    expect(decoded.villagerRelationships?.[dateableVillagers[2]]).toBe("platonic");
  });

  it.each(["undeclared", "yes", "no"] as const)("round-trips childChoice %s", async (choice) => {
    const completed = makeCompleted({ childChoice: choice });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.childChoice).toBe(choice);
  });

  it("round-trips almanacRecipes", async () => {
    const recipeIds = (Object.keys(trackerData.recipes) as RecipeId[]).slice(0, 3);
    const completed = makeCompleted({ almanacRecipes: new Set(recipeIds) });
    const payload = await encodeTransferPayload(completed);
    const decoded = await decodeTransferPayload(payload);
    expect(decoded.almanacRecipes).toEqual(new Set(recipeIds));
  });

  it.each([
    ["v1", V1_FIXTURE],
    ["v5", V5_ALMANAC_FIXTURE],
    ["v8", V8_BOUNDARY_FIXTURE],
    ["v9", V9_BOUNDARY_FIXTURE],
    ["v10", V10_UNMARKED_FIXTURE],
  ])("rejects unmarked %s payloads as foreign before interpreting them", async (_, payload) => {
    await expectDecodeError(payload, "not-transfer-code", /missing marker/i);
  });

  it.each([
    ["an empty string", ""],
    ["a URL", "https://example.com/MFGT"],
    ["base64url text", "Wifi0000"],
    ["a lowercase marker", "mfgtCw"],
  ])("rejects %s as not a transfer code", async (_, payload) => {
    await expectDecodeError(payload, "not-transfer-code", /missing marker/i);
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

  it.each(["", "not+a/valid=payload", "A", "%%%%"])(
    "rejects a marked payload with malformed base64url %j",
    async (body) => {
      await expectDecodeError(TRANSFER_MAGIC + body, "corrupt", /transfer payload/i);
    },
  );

  it.each([
    ["version zero", marked(new Uint8Array([0])), "corrupt"],
    ["future version", marked(new Uint8Array([TRANSFER_VERSION + 1])), "newer-version"],
    ["far-future version", marked(new Uint8Array([0xff])), "newer-version"],
  ] as const)("rejects unsupported %s", async (_, payload, code) => {
    await expectDecodeError(payload, code, /unsupported transfer version/i);
  });

  it("rejects a missing integrity checksum", async () => {
    await expectDecodeError(
      marked(new Uint8Array([TRANSFER_VERSION])),
      "corrupt",
      /integrity checksum/i,
    );
    await expectDecodeError(
      marked(new Uint8Array([TRANSFER_VERSION, 0, 1, 2])),
      "corrupt",
      /integrity checksum/i,
    );
  });

  it("rejects marked payloads from older versions before attempting decompression", async () => {
    await expectDecodeError(
      marked(new Uint8Array([TRANSFER_VERSION - 1])),
      "outdated",
      /older version/i,
    );
  });

  it("rejects truncated compressed data", async () => {
    const payload = await encodeTransferPayload(makeCompleted());
    const truncated = marked(unmarked(payload).slice(0, -1));
    await expectDecodeError(truncated, "corrupt", /compressed transfer payload/i);
  });

  it("rejects malformed compressed data", async () => {
    const payload = marked(new Uint8Array([TRANSFER_VERSION, 0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7]));
    await expectDecodeError(payload, "corrupt", /compressed transfer payload/i);
  });

  it.each(["truncated", "trailing"])("rejects %s decompressed data", async (kind) => {
    const payload = await encodeTransferPayload(makeCompleted());
    const raw = await decompressTransferRaw(payload);
    const malformed = kind === "truncated" ? raw.slice(0, -1) : new Uint8Array([...raw, 0]);
    const malformedPayload = await compressTransferRaw(TRANSFER_VERSION, malformed);

    await expectDecodeError(malformedPayload, "corrupt", /length/i);
  });

  it("rejects a payload whose compressed content was corrupted, even when it decompresses to the expected length", async () => {
    // Regression test for a corruption that decompresses to a byte-identical length but different
    // content: without an integrity checksum this previously decoded silently into wrong progress.
    const payload = await encodeTransferPayload(
      makeCompleted({ mines: { floor: 40, spells: new Set() } }),
    );
    const raw = await decompressTransferRaw(payload);
    const corruptedRaw = new Uint8Array(raw);
    corruptedRaw[0] ^= 0x01;
    expect(corruptedRaw).toHaveLength(raw.length);

    // Keep the checksum bytes from the ORIGINAL (uncorrupted) payload, simulating a bit-flip that
    // landed in the compressed body after the checksum was computed and stored.
    const originalChecksumBytes = unmarked(payload).slice(1, 1 + CHECKSUM_BYTE_LENGTH);
    const corruptedCompressed = await compressRawOnly(corruptedRaw);
    const tamperedPayload = marked(
      new Uint8Array([TRANSFER_VERSION, ...originalChecksumBytes, ...corruptedCompressed]),
    );

    await expectDecodeError(tamperedPayload, "corrupt", /integrity check/i);
  });

  it("rejects a payload whose stored checksum does not match its content", async () => {
    const payload = await encodeTransferPayload(makeCompleted());
    const tampered = new Uint8Array(unmarked(payload));
    tampered[1] ^= 0xff;

    await expectDecodeError(marked(tampered), "corrupt", /integrity check/i);
  });
});
