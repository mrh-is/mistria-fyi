import { canonicalAlmanacId, trackerData, trackerIndex } from "$lib/data/index.js";
import {
  clampMineFloor,
  clampRenownLevel,
  MAX_SKILL_LEVEL,
  MAX_VILLAGER_LEVEL,
} from "$lib/engine/progress.js";
import { normalizeRelationships } from "$lib/engine/relationships.js";
import { recordEntries, recordKeys, recordValues } from "$lib/utils";

import type { ChildChoice, CompletedState, QuestState } from "$lib/stores/user-state.svelte.js";
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
  Season,
  SkillId,
  SpellId,
  VillagerId,
  VillagerRelationship,
} from "$lib/types/tracker-data.js";

// ─── Constants ──────────────────────────────────────────────────────

export const TRANSFER_VERSION = 10;
export const TRANSFER_ORDERING_HASH = "50dbf1b9";
const MIN_SUPPORTED_TRANSFER_VERSION = 10;

/** First version to prepend a CRC-32 integrity checksum of the raw payload before compression. */
const CHECKSUM_VERSION = 9;
const CHECKSUM_BYTE_LENGTH = 4;

const SEASON_BY_ORD: Season[] = ["spring", "summer", "fall", "winter"];
const SEASON_ORD: Record<Season, number> = { fall: 2, spring: 0, summer: 1, winter: 3 };
/**
 * Why a transfer payload could not be decoded. The UI localizes the code; the English message is
 * for debugging only.
 *
 * - `outdated`: an older app version created the payload, and its orderings no longer apply.
 * - `newer-version`: a newer app version created the payload.
 * - `corrupt`: the payload is malformed, truncated, or fails its integrity check.
 */
export type TransferDecodeErrorCode = "corrupt" | "newer-version" | "outdated";

export class TransferDecodeError extends Error {
  readonly code: TransferDecodeErrorCode;

  constructor(code: TransferDecodeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TransferDecodeError";
    this.code = code;
  }
}

// ─── Deterministic orderings (derived from trackerData) ─────────────

/**
 * Decode base64url string → Partial<CompletedState> for merging. Every rejection is a
 * {@link TransferDecodeError}; a failure deeper in the layout is reported as `corrupt`.
 */
export async function decodeTransferPayload(payload: string): Promise<Partial<CompletedState>> {
  try {
    return await decodeTransferPayloadUnchecked(payload);
  } catch (error) {
    if (error instanceof TransferDecodeError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new TransferDecodeError("corrupt", message, { cause: error });
  }
}

/** Encode CompletedState → base64url string for QR code */
export async function encodeTransferPayload(completed: CompletedState): Promise<string> {
  const parts: Uint8Array[] = [];

  // 1. Almanac items
  const almanacOrder = getAlmanacOrder();
  parts.push(toBitfield(almanacOrder, completed.almanac));

  // 2. Cosmetics (non-default-unlocked)
  const cosmeticOrder = getCosmeticOrder();
  parts.push(toBitfield(cosmeticOrder, completed.cosmetics));

  // 3. Animal variants (non-default-unlocked)
  const animalVariantOrder = getAnimalVariantOrder();
  const animalVariantKeys = animalVariantOrder.map((v) => `${v.animalId}:${v.variantId}`);
  const completedAnimalVariants = new Set<string>();
  for (const { animalId, variantId } of animalVariantOrder) {
    const animalSet = completed.animals[animalId];
    if (animalSet.has(variantId)) {
      completedAnimalVariants.add(`${animalId}:${variantId}`);
    }
  }
  parts.push(toBitfield(animalVariantKeys, completedAnimalVariants));

  // 4. Animal cosmetics
  const animalCosmeticOrder = getAnimalCosmeticOrder();
  const animalCosmeticKeys = animalCosmeticOrder.map((v) => `${v.animalId}:${v.cosmeticId}`);
  const completedAnimalCosmetics = new Set<string>();
  for (const { animalId, cosmeticId } of animalCosmeticOrder) {
    const cosmeticSet = completed.animalCosmetics[animalId];
    if (cosmeticSet.has(cosmeticId)) {
      completedAnimalCosmetics.add(`${animalId}:${cosmeticId}`);
    }
  }
  parts.push(toBitfield(animalCosmeticKeys, completedAnimalCosmetics));

  // 5. Museum items
  const museumOrder = getMuseumOrder();
  parts.push(toBitfield(museumOrder, completed.museum));

  // 6. Spell bitmask (1 byte)
  const spellOrder = getSpellOrder();
  let spellByte = 0;
  for (let i = 0; i < spellOrder.length; i++) {
    if (completed.mines.spells.has(spellOrder[i])) {
      spellByte |= 1 << (7 - i);
    }
  }
  parts.push(new Uint8Array([spellByte]));

  // 7. Mine floor (1 byte)
  parts.push(new Uint8Array([Math.min(255, completed.mines.floor)]));

  // 8. Renown (2 bytes big-endian uint16)
  const renown = Math.min(0xffff, completed.renown);
  parts.push(new Uint8Array([(renown >> 8) & 0xff, renown & 0xff]));

  // 9. Villager levels (4 bits each, high nibble first)
  const villagerOrder = getVillagerOrder();
  const villagerBytes = new Uint8Array(Math.ceil(villagerOrder.length / 2));
  for (let i = 0; i < villagerOrder.length; i++) {
    const level = Math.min(15, completed.villagerLevels[villagerOrder[i]] ?? 0);
    const byteIndex = Math.floor(i / 2);
    if (i % 2 === 0) {
      villagerBytes[byteIndex] |= (level & 0xf) << 4;
    } else {
      villagerBytes[byteIndex] |= level & 0xf;
    }
  }
  parts.push(villagerBytes);

  // 10. Skill levels (1 byte each)
  const skillOrder = getSkillOrder();
  const skillBytes = new Uint8Array(skillOrder.length);
  for (let i = 0; i < skillOrder.length; i++) {
    skillBytes[i] = Math.min(255, completed.skillLevels[skillOrder[i]] ?? 0);
  }
  parts.push(skillBytes);

  // 11. Quest states (2 bits each, 4 per byte)
  const questOrder = getQuestOrder();
  const questBytes = new Uint8Array(Math.ceil(questOrder.length / 4));
  for (let i = 0; i < questOrder.length; i++) {
    const questKey = questOrder[i].questId;
    const stateVal = completed.questStates[questKey] ?? "none";
    const bits = stateVal === "none" ? 0 : stateVal === "obtained" ? 1 : 2;
    const byteIndex = Math.floor(i / 4);
    const bitOffset = (3 - (i % 4)) * 2;
    questBytes[byteIndex] |= (bits & 0x3) << bitOffset;
  }
  parts.push(questBytes);

  // 12. Perk bitfield (new in v2)
  const perkOrder = getPerkOrder();
  parts.push(toBitfield(perkOrder, completed.unlockedPerks));

  // 13. Married villager index (v2+, still written for v6 backward compat)
  const marriedVillager = Object.entries(completed.villagerRelationships).find(
    ([, r]) => r === "married",
  )?.[0] as undefined | VillagerId;
  const marriedIndex = marriedVillager ? villagerOrder.indexOf(marriedVillager) : -1;
  parts.push(new Uint8Array([marriedIndex === -1 ? 0xff : marriedIndex]));

  // 14. Pet cosmetic sets bitfield (new in v3)
  const petCosmeticOrder = getPetCosmeticOrder();
  parts.push(toBitfield(petCosmeticOrder, completed.petCosmetics));

  // 15. Pet skins bitfield (new in v3)
  const petSkinOrder = getPetSkinOrder();
  parts.push(toBitfield(petSkinOrder, completed.petSkins));

  // 16. Date bitfield (new in v4)
  const dateOrder = getDateOrder();
  parts.push(toBitfield(dateOrder, completed.dates));

  // 17. Progression byte (new in v5) — bits 7-6: reachedSeason, bit 5: hasUpperFloor
  const progressionByte =
    ((SEASON_ORD[completed.reachedSeason] & 0x3) << 6) | (completed.hasUpperFloor ? 0x20 : 0);
  parts.push(new Uint8Array([progressionByte]));

  // 18. Romantic villager bitfield (v5+, still written for v6 backward compat)
  const romanticOrder = getDateableVillagerOrder();
  const romanticSet = new Set<string>();
  for (const [id, rel] of Object.entries(completed.villagerRelationships)) {
    if (rel === "romantic" || rel === "proposed" || rel === "married") {
      romanticSet.add(id);
    }
  }
  parts.push(toBitfield(romanticOrder, romanticSet));

  // 19. Villager relationship states (new in v7) — 3 bits per dateable villager
  const RELATIONSHIP_ENCODE: Record<VillagerRelationship, number> = {
    married: 4,
    platonic: 1,
    proposed: 3,
    romantic: 2,
    undecided: 0,
  };
  const dateableOrder = getDateableVillagerOrder();
  const relBitCount = dateableOrder.length * 3;
  const relByteCount = Math.ceil(relBitCount / 8);
  const relBytes = new Uint8Array(relByteCount);
  for (let i = 0; i < dateableOrder.length; i++) {
    const rel = completed.villagerRelationships[dateableOrder[i]] ?? "undecided";
    const bits = RELATIONSHIP_ENCODE[rel];
    const bitOffset = i * 3;
    const byteIndex = Math.floor(bitOffset / 8);
    const bitShift = 5 - (bitOffset % 8);
    if (bitShift >= 0) {
      relBytes[byteIndex] |= (bits & 0x7) << bitShift;
    } else {
      relBytes[byteIndex] |= (bits & 0x7) >> -bitShift;
      relBytes[byteIndex + 1] |= (bits & 0x7) << (8 + bitShift);
    }
  }
  parts.push(relBytes);

  // 20. Child choice (new in v7) — 1 byte
  const childByte =
    completed.childChoice === "yes" ? 0x01 : completed.childChoice === "no" ? 0x02 : 0x00;
  parts.push(new Uint8Array([childByte]));

  // 21. Almanac recipes bitfield (new in v8)
  const recipeOrder = getRecipeOrder();
  parts.push(toBitfield(recipeOrder, completed.almanacRecipes));

  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const raw = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    raw.set(part, offset);
    offset += part.length;
  }

  // Compress, then prepend the version byte and an integrity checksum of the raw payload
  const compressed = await compressBytes(raw);
  const checksum = crc32(raw);
  const payload = new Uint8Array(1 + CHECKSUM_BYTE_LENGTH + compressed.length);
  payload[0] = TRANSFER_VERSION;
  payload[1] = (checksum >>> 24) & 0xff;
  payload[2] = (checksum >>> 16) & 0xff;
  payload[3] = (checksum >>> 8) & 0xff;
  payload[4] = checksum & 0xff;
  payload.set(compressed, 1 + CHECKSUM_BYTE_LENGTH);

  return toBase64url(payload);
}

async function compressBytes(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decodeTransferPayloadUnchecked(payload: string): Promise<Partial<CompletedState>> {
  const payloadBytes = fromBase64url(payload);
  if (payloadBytes.length === 0) {
    throw new Error("Malformed transfer payload: missing version byte");
  }
  const version = payloadBytes[0];
  if (version > TRANSFER_VERSION) {
    throw new TransferDecodeError(
      "newer-version",
      `Unsupported transfer version: ${String(version)}`,
    );
  }
  if (version < 1) {
    throw new Error(`Unsupported transfer version: ${String(version)}`);
  }
  if (version < MIN_SUPPORTED_TRANSFER_VERSION) {
    throw new TransferDecodeError(
      "outdated",
      "This QR code was created by an older version of Mistria Field Guide.",
    );
  }

  let expectedChecksum: null | number = null;
  let bodyStart = 1;
  if (version >= CHECKSUM_VERSION) {
    if (payloadBytes.length < 1 + CHECKSUM_BYTE_LENGTH) {
      throw new Error("Malformed transfer payload: missing integrity checksum");
    }
    expectedChecksum =
      ((payloadBytes[1] << 24) |
        (payloadBytes[2] << 16) |
        (payloadBytes[3] << 8) |
        payloadBytes[4]) >>>
      0;
    bodyStart = 1 + CHECKSUM_BYTE_LENGTH;
  }

  const compressed = payloadBytes.slice(bodyStart);
  if (compressed.length === 0) {
    throw new Error("Invalid compressed transfer payload: missing compressed data");
  }

  let raw: Uint8Array;
  try {
    raw = await decompressBytes(compressed);
  } catch (error) {
    throw new Error("Invalid compressed transfer payload", { cause: error });
  }

  if (expectedChecksum !== null && crc32(raw) !== expectedChecksum) {
    throw new Error("Transfer payload failed integrity check: data may be corrupted");
  }

  const expectedLength = getTransferRawLength(version);
  if (raw.length !== expectedLength) {
    throw new Error(
      `Invalid transfer payload length: expected ${String(expectedLength)} bytes, received ${String(raw.length)}`,
    );
  }

  let offset = 0;

  function readBytes(count: number): Uint8Array {
    if (offset + count > raw.length) {
      throw new Error(
        `Transfer layout overflow: need ${String(count)} bytes at offset ${String(offset)}, have ${String(raw.length)}`,
      );
    }
    const slice = raw.slice(offset, offset + count);
    offset += count;
    return slice;
  }

  // 1. Almanac items
  const almanacOrder = version >= 6 ? getAlmanacOrder() : getLegacyAlmanacOrder();
  const almanacBytes = readBytes(Math.ceil(almanacOrder.length / 8));
  const rawAlmanac = fromBitfield(almanacOrder, almanacBytes, "almanac bitfield") as Set<ItemId>;
  const almanac =
    version >= 6
      ? rawAlmanac
      : new Set([...rawAlmanac].map((id) => canonicalAlmanacId.get(id) ?? id));

  // 2. Cosmetics (non-default-unlocked)
  const cosmeticOrder = getCosmeticOrder();
  const cosmeticBytes = readBytes(Math.ceil(cosmeticOrder.length / 8));
  const cosmetics = fromBitfield(
    cosmeticOrder,
    cosmeticBytes,
    "cosmetic bitfield",
  ) as Set<CosmeticId>;

  // 3. Animal variants (non-default-unlocked)
  const animalVariantOrder = getAnimalVariantOrder();
  const animalVariantKeys = animalVariantOrder.map((v) => `${v.animalId}:${v.variantId}`);
  const animalVariantBytes = readBytes(Math.ceil(animalVariantKeys.length / 8));
  const animalVariantSet = fromBitfield(
    animalVariantKeys,
    animalVariantBytes,
    "animal variant bitfield",
  );
  const animals: Record<string, Set<AnimalVariantId>> = {};
  for (const key of animalVariantSet) {
    const [animalId, variantId] = key.split(":");
    const existing = (animals[animalId] ??= new Set<AnimalVariantId>());
    existing.add(variantId as AnimalVariantId);
  }

  // 4. Animal cosmetics
  const animalCosmeticOrder = getAnimalCosmeticOrder();
  const animalCosmeticKeys = animalCosmeticOrder.map((v) => `${v.animalId}:${v.cosmeticId}`);
  const animalCosmeticBytes = readBytes(Math.ceil(animalCosmeticKeys.length / 8));
  const animalCosmeticSet = fromBitfield(
    animalCosmeticKeys,
    animalCosmeticBytes,
    "animal cosmetic bitfield",
  );
  const animalCosmetics: Record<string, Set<CosmeticId>> = {};
  for (const key of animalCosmeticSet) {
    const [animalId, cosmeticId] = key.split(":");
    const existing = (animalCosmetics[animalId] ??= new Set<CosmeticId>());
    existing.add(cosmeticId as CosmeticId);
  }

  // 5. Museum items
  const museumOrder = getMuseumOrder();
  const museumBytes = readBytes(Math.ceil(museumOrder.length / 8));
  const museum = fromBitfield(museumOrder, museumBytes, "museum bitfield") as Set<ItemId>;

  // 6. Spell bitmask (1 byte)
  const spellOrder = getSpellOrder();
  const spellByte = readBytes(1)[0];
  assertZeroPadding(spellOrder.length, new Uint8Array([spellByte]), "spell reserved bits");
  const spells = new Set<SpellId>();
  for (let i = 0; i < spellOrder.length; i++) {
    if (spellByte & (1 << (7 - i))) {
      spells.add(spellOrder[i]);
    }
  }

  // 7. Mine floor (1 byte)
  const floor = readBytes(1)[0];

  // 8. Renown (2 bytes big-endian uint16)
  const renownBytes = readBytes(2);
  const renown = (renownBytes[0] << 8) | renownBytes[1];

  // 9. Villager levels (4 bits each, high nibble first)
  const villagerOrder = getVillagerOrder();
  const villagerBytes = readBytes(Math.ceil(villagerOrder.length / 2));
  const villagerLevels: Record<string, number> = {};
  for (let i = 0; i < villagerOrder.length; i++) {
    const byteIndex = Math.floor(i / 2);
    const level =
      i % 2 === 0 ? (villagerBytes[byteIndex] >> 4) & 0xf : villagerBytes[byteIndex] & 0xf;
    villagerLevels[villagerOrder[i]] = level;
  }

  // 10. Skill levels (1 byte each)
  const skillOrder = getSkillOrder();
  const skillBytes = readBytes(skillOrder.length);
  const skillLevels: Record<string, number> = {};
  for (let i = 0; i < skillOrder.length; i++) {
    skillLevels[skillOrder[i]] = skillBytes[i];
  }

  // 11. Quest states (2 bits each, 4 per byte)
  const questOrder = getQuestOrder();
  const questByteCount = Math.ceil(questOrder.length / 4);
  const questBytes = readBytes(questByteCount);
  assertZeroPadding(questOrder.length * 2, questBytes, "quest reserved bits");
  const questStates: Record<string, QuestState> = {};
  const questStateMap: QuestState[] = ["none", "obtained", "completed"];
  for (let i = 0; i < questOrder.length; i++) {
    const byteIndex = Math.floor(i / 4);
    const bitOffset = (3 - (i % 4)) * 2;
    const bits = (questBytes[byteIndex] >> bitOffset) & 0x3;
    if (bits >= questStateMap.length) {
      throw new Error(`Invalid quest state code: ${String(bits)}`);
    }
    questStates[questOrder[i].questId] = questStateMap[bits];
  }

  // 12. Perk bitfield (v2 only)
  // 13. Married villager index (v2 only) — 1 byte: 0xFF = no spouse, else index into villagerOrder
  let unlockedPerks = new Set<PerkId>();
  let marriedVillager: null | VillagerId = null;

  if (version >= 2) {
    const perkOrder = getPerkOrder();
    const perkBytes = readBytes(Math.ceil(perkOrder.length / 8));
    unlockedPerks = fromBitfield(perkOrder, perkBytes, "perk bitfield") as Set<PerkId>;

    const marriedByte = readBytes(1)[0];
    if (marriedByte !== 0xff) {
      marriedVillager = villagerOrder[marriedByte] ?? null;
      if (!marriedVillager) {
        throw new Error(`Invalid spouse index: ${String(marriedByte)}`);
      }
    }
  }

  // 14. Pet cosmetic sets bitfield (v3 only)
  // 15. Pet skins bitfield (v3 only)
  let petCosmetics = new Set<PetCosmeticSetId>();
  let petSkins = new Set<PetSkinId>();

  if (version >= 3) {
    const petCosmeticOrder = getPetCosmeticOrder();
    const petCosmeticBytes = readBytes(Math.ceil(petCosmeticOrder.length / 8));
    petCosmetics = fromBitfield(
      petCosmeticOrder,
      petCosmeticBytes,
      "pet cosmetic bitfield",
    ) as Set<PetCosmeticSetId>;

    const petSkinOrder = getPetSkinOrder();
    const petSkinBytes = readBytes(Math.ceil(petSkinOrder.length / 8));
    petSkins = fromBitfield(petSkinOrder, petSkinBytes, "pet skin bitfield") as Set<PetSkinId>;
  }

  // 16. Date bitfield (v4 only)
  let dates = new Set<DateId>();
  if (version >= 4) {
    const dateOrder = getDateOrder();
    const dateBytes = readBytes(Math.ceil(dateOrder.length / 8));
    dates = fromBitfield(dateOrder, dateBytes, "date bitfield") as Set<DateId>;
  }

  // 17. Progression byte (v5 only) — bits 7-6: reachedSeason, bit 5: hasUpperFloor, bits 4-0: reserved
  // 18. Romantic villager bitfield (v5 only)
  let hasUpperFloor = false;
  let reachedSeason: Season = "spring";
  const villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>> = {};

  if (version >= 5) {
    const progressionByte = readBytes(1)[0];
    if (progressionByte & 0x1f) {
      throw new Error("Invalid progression reserved bits: expected zero");
    }
    reachedSeason = SEASON_BY_ORD[(progressionByte >> 6) & 0x3];
    hasUpperFloor = !!(progressionByte & 0x20);

    const romanticOrder = getDateableVillagerOrder();
    const romanticBytes = readBytes(Math.ceil(romanticOrder.length / 8));
    const romanticVillagers = fromBitfield(
      romanticOrder,
      romanticBytes,
      "romantic villager bitfield",
    ) as Set<VillagerId>;

    for (const villagerId of romanticVillagers) {
      villagerRelationships[villagerId] = "romantic";
    }
  }

  if (marriedVillager) {
    villagerRelationships[marriedVillager] = "married";
  }

  // 19. Villager relationship states (v7) — 3 bits per dateable villager
  // 20. Child choice (v7) — 1 byte
  let childChoice: ChildChoice = "undeclared";

  if (version >= 7) {
    const dateableOrder = getDateableVillagerOrder();
    const relByteCount = Math.ceil((dateableOrder.length * 3) / 8);
    const relBytes = readBytes(relByteCount);
    assertZeroPadding(dateableOrder.length * 3, relBytes, "relationship reserved bits");
    const RELATIONSHIP_MAP = [
      "undecided",
      "platonic",
      "romantic",
      "proposed",
      "married",
    ] as const satisfies readonly VillagerRelationship[];
    for (let i = 0; i < dateableOrder.length; i++) {
      const bitOffset = i * 3;
      const byteIndex = Math.floor(bitOffset / 8);
      const bitShift = 5 - (bitOffset % 8);
      let bits: number;
      if (bitShift >= 0) {
        bits = (relBytes[byteIndex] >> bitShift) & 0x7;
      } else {
        bits =
          ((relBytes[byteIndex] << -bitShift) | (relBytes[byteIndex + 1] >> (8 + bitShift))) & 0x7;
      }
      if (bits >= RELATIONSHIP_MAP.length) {
        throw new Error(`Invalid relationship state code: ${String(bits)}`);
      }
      const rel = RELATIONSHIP_MAP[bits];
      if (rel !== "undecided") {
        villagerRelationships[dateableOrder[i]] = rel;
      }
    }

    const childByte = readBytes(1)[0];
    if (childByte > 0x02) {
      throw new Error(`Invalid child choice code: ${String(childByte)}`);
    }
    childChoice = childByte === 0x01 ? "yes" : childByte === 0x02 ? "no" : "undeclared";
  }

  // 21. Almanac recipes bitfield (v8+)
  let almanacRecipes = new Set<RecipeId>();
  if (version >= 8) {
    const recipeOrder = getRecipeOrder();
    const recipeBytes = readBytes(Math.ceil(recipeOrder.length / 8));
    almanacRecipes = fromBitfield(recipeOrder, recipeBytes, "recipe bitfield") as Set<RecipeId>;
  }

  normalizeRelationships(villagerRelationships);

  for (const id of recordKeys(skillLevels)) {
    skillLevels[id] = Math.min(skillLevels[id], MAX_SKILL_LEVEL);
  }
  for (const id of recordKeys(villagerLevels)) {
    villagerLevels[id] = Math.min(villagerLevels[id], MAX_VILLAGER_LEVEL);
  }

  return {
    almanac,
    almanacRecipes,
    animalCosmetics,
    animals,
    childChoice,
    cosmetics,
    dates,
    hasUpperFloor,
    mines: { floor: clampMineFloor(floor), spells },
    museum,
    petCosmetics,
    petSkins,
    questStates,
    reachedSeason,
    renown: clampRenownLevel(renown),
    skillLevels,
    unlockedPerks,
    villagerLevels,
    villagerRelationships,
  };
}

async function decompressBytes(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function fromBase64url(str: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(str) || str.length % 4 === 1) {
    throw new Error("Malformed transfer payload: invalid base64url encoding");
  }

  // Restore standard base64 characters and padding
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch (error) {
    throw new Error("Malformed transfer payload: invalid base64url encoding", { cause: error });
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  if (toBase64url(bytes) !== str) {
    throw new Error("Malformed transfer payload: non-canonical base64url encoding");
  }
  return bytes;
}

// ─── Integrity checksum (CRC-32, IEEE 802.3 polynomial) ────────────

let crc32Table: null | Uint32Array = null;

export function getTransferOrderingHash(): string {
  const orderings = [
    getAlmanacOrder(),
    getCosmeticOrder(),
    getAnimalVariantOrder().map(({ animalId, variantId }) => `${animalId}:${variantId}`),
    getAnimalCosmeticOrder().map(({ animalId, cosmeticId }) => `${animalId}:${cosmeticId}`),
    getMuseumOrder(),
    getSpellOrder(),
    getVillagerOrder(),
    getSkillOrder(),
    getQuestOrder().map(({ type, questId }) => `${type}:${questId}`),
    getPerkOrder(),
    getPetCosmeticOrder(),
    getPetSkinOrder(),
    getDateOrder(),
    getDateableVillagerOrder(),
    getRecipeOrder(),
  ];
  return crc32(new TextEncoder().encode(JSON.stringify(orderings)))
    .toString(16)
    .padStart(8, "0");
}

function assertZeroPadding(usedBitCount: number, bytes: Uint8Array, label: string): void {
  const reservedBitCount = bytes.length * 8 - usedBitCount;
  if (reservedBitCount <= 0) return;
  const reservedMask = (1 << reservedBitCount) - 1;
  if ((bytes.at(-1) ?? 0) & reservedMask) {
    throw new Error(`Invalid ${label}: expected zero`);
  }
}

function crc32(bytes: Uint8Array): number {
  const table = getCrc32Table();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function fromBitfield(ordered: string[], bytes: Uint8Array, label: string): Set<string> {
  assertZeroPadding(ordered.length, bytes, `${label} reserved bits`);
  const result = new Set<string>();
  for (let i = 0; i < ordered.length; i++) {
    if (bytes[Math.floor(i / 8)] & (1 << (7 - (i % 8)))) {
      result.add(ordered[i]);
    }
  }
  return result;
}

function getAlmanacOrder(): ItemId[] {
  return trackerIndex.uniqueAlmanacCanonicalIds;
}

function getCrc32Table(): Uint32Array {
  if (crc32Table) return crc32Table;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crc32Table = table;
  return table;
}

function getTransferRawLength(version: number): number {
  let length =
    Math.ceil((version >= 6 ? getAlmanacOrder() : getLegacyAlmanacOrder()).length / 8) +
    Math.ceil(getCosmeticOrder().length / 8) +
    Math.ceil(getAnimalVariantOrder().length / 8) +
    Math.ceil(getAnimalCosmeticOrder().length / 8) +
    Math.ceil(getMuseumOrder().length / 8) +
    1 +
    1 +
    2 +
    Math.ceil(getVillagerOrder().length / 2) +
    getSkillOrder().length +
    Math.ceil(getQuestOrder().length / 4);

  if (version >= 2) {
    length += Math.ceil(getPerkOrder().length / 8) + 1;
  }
  if (version >= 3) {
    length += Math.ceil(getPetCosmeticOrder().length / 8) + Math.ceil(getPetSkinOrder().length / 8);
  }
  if (version >= 4) {
    length += Math.ceil(getDateOrder().length / 8);
  }
  if (version >= 5) {
    length += 1 + Math.ceil(getDateableVillagerOrder().length / 8);
  }
  if (version >= 7) {
    length += Math.ceil((getDateableVillagerOrder().length * 3) / 8) + 1;
  }
  if (version >= 8) {
    length += Math.ceil(getRecipeOrder().length / 8);
  }

  return length;
}

// v1–v5 used TOML-order-first representatives; v6 switched to alphabetical-first.
// This table maps the 88 new canonical IDs back to their old representatives so the
// legacy bit ordering can be reconstructed from the current tracker data.
const V5_CANONICAL_REMAP = new Map<string, string>([
  ["bakery_bread_basket_coffee", "bakery_bread_basket_pastel"],
  ["bakery_cake_case_coffee", "bakery_cake_case_pastel"],
  ["bakery_cake_coffee", "bakery_cake_pastel"],
  ["bakery_cake_slice_coffee", "bakery_cake_slice_pastel"],
  ["bakery_cookie_jar_coffee", "bakery_cookie_jar_pastel"],
  ["bakery_cutting_board_coffee", "bakery_cutting_board_pastel"],
  ["basic_area_rug_green", "basic_area_rug_yellow"],
  ["basic_doormat_green", "basic_doormat_yellow"],
  ["basic_wood_chest_black", "basic_wood_chest_dark"],
  ["bathroom_curtain_stand_black", "bathroom_curtain_stand_blue"],
  ["bathroom_wall_towel_black", "bathroom_wall_towel_blue"],
  ["broken_pillar_v1_gray", "broken_pillar_v1_white"],
  ["butterfly_wall_lamp_bronze", "butterfly_wall_lamp_gold"],
  ["cavern_floor_brazier_blue", "cavern_floor_brazier_purple"],
  ["cavern_wall_brazier_blue", "cavern_wall_brazier_purple"],
  ["chess_bishop_black", "chess_bishop_white"],
  ["chess_king_black", "chess_king_white"],
  ["chess_knight_black", "chess_knight_white"],
  ["chess_pawn_black", "chess_pawn_white"],
  ["chess_queen_black", "chess_queen_white"],
  ["chess_rook_black", "chess_rook_white"],
  ["chess_table_black", "chess_table_white"],
  ["cottage_bed_ash", "cottage_bed_oak"],
  ["cottage_bed_double_ash", "cottage_bed_double_oak"],
  ["cottage_chair_ash", "cottage_chair_oak"],
  ["cottage_dresser_ash", "cottage_dresser_oak"],
  ["cottage_flooring_ash", "cottage_flooring_oak"],
  ["cottage_fridge_ash", "cottage_fridge_oak"],
  ["cottage_nightstand_ash", "cottage_nightstand_oak"],
  ["cottage_plant_shelf_ash", "cottage_plant_shelf_oak"],
  ["cottage_potted_fig_ash", "cottage_potted_fig_oak"],
  ["cottage_potted_flowers_ash", "cottage_potted_flowers_oak"],
  ["cottage_rug_ash", "cottage_rug_oak"],
  ["cottage_table_ash", "cottage_table_oak"],
  ["cottage_wall_flowers_ash", "cottage_wall_flowers_oak"],
  ["cottage_wall_window_ash", "cottage_wall_window_oak"],
  ["cottage_wallpaper_ash", "cottage_wallpaper_oak"],
  ["counter_kitchen_blue", "counter_kitchen_pink"],
  ["dragon_altar_earth", "dragon_altar_water"],
  ["enchantern_lamp_blue", "enchantern_lamp_yellow"],
  ["essence_bat_garland_blue", "essence_bat_garland_purple"],
  ["fall_bed_cream", "fall_bed_red"],
  ["fall_double_bed_cream", "fall_double_bed_red"],
  ["fall_table_cream", "fall_table_orange"],
  ["fishing_tank_gold", "fishing_tank_silver"],
  ["fishing_window_gold", "fishing_window_silver"],
  ["haunted_attic_armoire_dark", "haunted_attic_armoire_dusty"],
  ["haunted_attic_bed_dark", "haunted_attic_bed_dusty"],
  ["haunted_attic_chair_dark", "haunted_attic_chair_dusty"],
  ["haunted_attic_double_bed_dark", "haunted_attic_double_bed_dusty"],
  ["haunted_attic_dress_form_dark", "haunted_attic_dress_form_dusty"],
  ["haunted_attic_flooring_dark", "haunted_attic_flooring_dusty"],
  ["haunted_attic_nightstand_dark", "haunted_attic_nightstand_dusty"],
  ["haunted_attic_rocking_chair_dark", "haunted_attic_rocking_chair_dusty"],
  ["haunted_attic_table_dark", "haunted_attic_table_dusty"],
  ["haunted_attic_wall_shelf_dark", "haunted_attic_wall_shelf_dusty"],
  ["haunted_attic_wall_window_dark", "haunted_attic_wall_window_dusty"],
  ["haunted_attic_wallpaper_dark", "haunted_attic_wallpaper_dusty"],
  ["kitchen_scale_blue", "kitchen_scale_yellow"],
  ["kitchen_utensil_holder_blue", "kitchen_utensil_holder_pink"],
  ["large_fluffy_rug_beige", "large_fluffy_rug_blue"],
  ["lava_caves_obsidian_fence_blue", "lava_caves_obsidian_fence_purple"],
  ["mushroom_sofa_blue", "mushroom_sofa_red"],
  ["ornate_rug_large_rectangle_blue", "ornate_rug_large_rectangle_red"],
  ["ornate_rug_large_round_blue", "ornate_rug_large_round_red"],
  ["ornate_rug_large_square_blue", "ornate_rug_large_square_red"],
  ["ornate_rug_medium_round_blue", "ornate_rug_medium_round_red"],
  ["ornate_rug_medium_square_blue", "ornate_rug_medium_square_red"],
  ["ornate_rug_small_blue", "ornate_rug_small_red"],
  ["picnic_place_setting_pink", "picnic_place_setting_red"],
  ["picnic_rug_pink", "picnic_rug_red"],
  ["round_cushioned_stool_beige", "round_cushioned_stool_blue"],
  ["royal_chest_blue", "royal_chest_wood"],
  ["sapling_beanbag_chair_blue", "sapling_beanbag_chair_green"],
  ["small_bathmat_beige", "small_bathmat_blue"],
  ["star_cushion_blue", "star_cushion_yellow"],
  ["star_lantern_blue", "star_lantern_yellow"],
  ["star_viewing_blanket_blue", "star_viewing_blanket_yellow"],
  ["summer_bed_red", "summer_bed_yellow"],
  ["summer_chair_red", "summer_chair_yellow"],
  ["summer_double_bed_red", "summer_double_bed_yellow"],
  ["summer_flooring_red", "summer_flooring_yellow"],
  ["summer_jar_lamp_red", "summer_jar_lamp_yellow"],
  ["summer_rug_red", "summer_rug_yellow"],
  ["summer_table_red", "summer_table_yellow"],
  ["summer_wallpaper_red", "summer_wallpaper_yellow"],
  ["training_dummy_clod", "training_dummy_sapling"],
  ["void_gryphon_statue_blue", "void_gryphon_statue_purple"],
]);

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function getAnimalCosmeticOrder(): { animalId: AnimalId; cosmeticId: CosmeticId }[] {
  const result: { animalId: AnimalId; cosmeticId: CosmeticId }[] = [];
  for (const [animalId, animal] of Object.entries(trackerData.animals).sort(([a], [b]) =>
    compareCodeUnits(a, b),
  )) {
    for (const cosmeticId of (Object.keys(animal.cosmetics) as CosmeticId[]).sort()) {
      result.push({ animalId: animalId as AnimalId, cosmeticId });
    }
  }
  return result;
}

function getAnimalVariantOrder(): { animalId: AnimalId; variantId: AnimalVariantId }[] {
  const result: { animalId: AnimalId; variantId: AnimalVariantId }[] = [];
  for (const [animalId, animal] of recordEntries(trackerData.animals).sort(([a], [b]) =>
    compareCodeUnits(a, b),
  )) {
    for (const tier of animal.variantTiers) {
      for (const [variantId, variant] of recordEntries(tier).sort(([a], [b]) =>
        compareCodeUnits(a, b),
      )) {
        if (!(variant.source.type === "default")) {
          result.push({ animalId, variantId });
        }
      }
    }
  }
  return result;
}

function getCosmeticOrder(): CosmeticId[] {
  return (Object.keys(trackerData.cosmetics) as CosmeticId[])
    .filter((id) => !trackerData.cosmetics[id].sources.some((s) => s.type === "default"))
    .sort();
}

// ─── Bitfield helpers ───────────────────────────────────────────────

function getDateableVillagerOrder(): VillagerId[] {
  return (Object.keys(trackerData.villagers) as VillagerId[])
    .filter((id) => trackerData.villagers[id].dateable)
    .sort();
}

function getDateOrder(): DateId[] {
  return (Object.keys(trackerData.dates) as DateId[]).sort();
}

function getLegacyAlmanacOrder(): ItemId[] {
  return recordEntries(trackerData.almanac).flatMap(([categoryId, { items }]) =>
    items
      .filter((entry) => trackerData.items[entry.itemIds[0]].category === categoryId)
      .map((entry) => (V5_CANONICAL_REMAP.get(entry.itemIds[0]) ?? entry.itemIds[0]) as ItemId)
      .toSorted(),
  );
}

// ─── Compression (Web Compression Streams API) ─────────────────────

function getMuseumOrder(): ItemId[] {
  return recordValues(trackerData.museum)
    .flatMap(({ sets }) => recordValues(sets).flatMap(({ items }) => items))
    .sort();
}

function getPerkOrder(): PerkId[] {
  return recordValues(trackerData.skills)
    .flatMap((skill) => skill.perkTiers.flatMap((tier) => recordKeys(tier)))
    .sort();
}

function getPetCosmeticOrder(): PetCosmeticSetId[] {
  return (Object.keys(trackerData.pets.cosmetics) as PetCosmeticSetId[]).sort();
}

function getPetSkinOrder(): PetSkinId[] {
  return (Object.keys(trackerData.pets.skins) as PetSkinId[]).sort();
}

function getQuestOrder(): { type: string; questId: QuestId }[] {
  const result: { type: string; questId: QuestId }[] = [];
  for (const type of recordKeys(trackerData.quests).sort()) {
    for (const questId of recordKeys(trackerData.quests[type]).sort()) {
      result.push({ type, questId });
    }
  }
  return result;
}

function getRecipeOrder(): RecipeId[] {
  return (Object.keys(trackerData.recipes) as RecipeId[]).sort();
}

function getSkillOrder(): SkillId[] {
  return (Object.keys(trackerData.skills) as SkillId[]).sort();
}

// ─── Base64url ──────────────────────────────────────────────────────

function getSpellOrder(): SpellId[] {
  return (Object.keys(trackerData.mines.spells) as SpellId[]).sort();
}

function getVillagerOrder(): VillagerId[] {
  return (Object.keys(trackerData.villagers) as VillagerId[]).sort();
}

// ─── Encode ─────────────────────────────────────────────────────────

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ─── Decode ─────────────────────────────────────────────────────────

function toBitfield(ordered: string[], completedSet: Set<string>): Uint8Array {
  const byteCount = Math.ceil(ordered.length / 8);
  const bytes = new Uint8Array(byteCount);
  for (let i = 0; i < ordered.length; i++) {
    if (completedSet.has(ordered[i])) {
      bytes[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
    }
  }
  return bytes;
}
