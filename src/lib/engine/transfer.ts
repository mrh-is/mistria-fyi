import { trackerData, trackerIndex } from "#lib/data/index.js";
import { seasonFromOrdinal, seasonOrdinal } from "#lib/engine/domain-primitives.js";
import {
  clampMineFloor,
  clampRenownLevel,
  MAX_HEART_LEVEL,
  MAX_SKILL_LEVEL,
} from "#lib/engine/progress.js";
import { applyMarriageCascade } from "#lib/engine/relationships.js";
import { getOrCreate, recordEntries, recordKeys, recordValues } from "#lib/utils/record.js";

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
} from "#lib/types/tracker-data.js";
import type { ChildChoice, ProgressState, QuestState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

// ─── Constants ──────────────────────────────────────────────────────

export const TRANSFER_VERSION = 1;
export const TRANSFER_ORDERING_HASH = "50dbf1b9";
const MIN_SUPPORTED_TRANSFER_VERSION = 1;

/**
 * Text every payload starts with. It marks a QR code as a Mistria Field Guide transfer
 * code, so an unrelated code is never mistaken for one from another version. Four base64url
 * characters encode whole bytes, so the rest of the payload stays independently decodable.
 */
export const TRANSFER_MAGIC = "MFGT";

/** Every supported version prepends a CRC-32 integrity checksum of the raw payload. */
const CHECKSUM_BYTE_LENGTH = 4;

/**
 * Why a transfer payload could not be decoded. The UI localizes the code; the English message is
 * for debugging only.
 *
 * - `not-transfer-code`: the payload lacks {@link TRANSFER_MAGIC}, so it isn't a transfer code.
 * - `outdated`: an older app version created the payload, and its orderings no longer apply.
 * - `newer-version`: a newer app version created the payload.
 * - `corrupt`: the payload is malformed, truncated, or fails its integrity check.
 */
export type TransferDecodeErrorCode =
  | "corrupt"
  | "newer-version"
  | "not-transfer-code"
  | "outdated";

export class TransferDecodeError extends Error {
  readonly code: TransferDecodeErrorCode;

  constructor(code: TransferDecodeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TransferDecodeError";
    this.code = code;
  }
}

/**
 * Decode base64url string → Partial<ProgressState> for merging. Every rejection is a
 * {@link TransferDecodeError}; a failure deeper in the layout is reported as `corrupt`.
 */
export async function decodeTransferPayload(payload: string): Promise<Partial<ProgressState>> {
  try {
    return await decodeTransferPayloadUnchecked(payload);
  } catch (error) {
    if (error instanceof TransferDecodeError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new TransferDecodeError("corrupt", message, { cause: error });
  }
}

/** Encode ProgressState → base64url string for QR code */
export async function encodeTransferPayload(
  completed: DeepReadonly<ProgressState>,
): Promise<string> {
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
  // A sparse map is valid input; the encoder doesn't rely on hydration backfill.
  const animalSets: Readonly<Partial<Record<string, ReadonlySet<string>>>> = completed.animals;
  for (const { animalId, variantId } of animalVariantOrder) {
    const animalSet = animalSets[animalId];
    if (animalSet?.has(variantId)) {
      completedAnimalVariants.add(`${animalId}:${variantId}`);
    }
  }
  parts.push(toBitfield(animalVariantKeys, completedAnimalVariants));

  // 4. Animal cosmetics
  const animalCosmeticOrder = getAnimalCosmeticOrder();
  const animalCosmeticKeys = animalCosmeticOrder.map((v) => `${v.animalId}:${v.cosmeticId}`);
  const completedAnimalCosmetics = new Set<string>();
  const cosmeticSets: Readonly<Partial<Record<string, ReadonlySet<string>>>> =
    completed.animalCosmetics;
  for (const { animalId, cosmeticId } of animalCosmeticOrder) {
    const cosmeticSet = cosmeticSets[animalId];
    if (cosmeticSet?.has(cosmeticId)) {
      completedAnimalCosmetics.add(`${animalId}:${cosmeticId}`);
    }
  }
  parts.push(toBitfield(animalCosmeticKeys, completedAnimalCosmetics));

  // 5. Museum items
  const museumOrder = getMuseumOrder();
  parts.push(toBitfield(museumOrder, completed.museum));

  // 6. Spell bitmask (1 byte)
  const spellOrder = getSpellOrder();
  assertSpellBitmaskFits(spellOrder.length);
  let spellByte = 0;
  for (let i = 0; i < spellOrder.length; i++) {
    if (completed.spells.has(spellOrder[i])) {
      spellByte |= 1 << (7 - i);
    }
  }

  // 7. Mine floor (1 byte)
  parts.push(new Uint8Array([spellByte]), new Uint8Array([Math.min(255, completed.mineFloor)]));

  // 8. Renown (2 bytes big-endian uint16)
  const renown = Math.min(0xff_ff, completed.renown);
  parts.push(new Uint8Array([(renown >> 8) & 0xff, renown & 0xff]));

  // 9. Heart levels (4 bits each, high nibble first)
  const villagerOrder = getVillagerOrder();
  const villagerBytes = new Uint8Array(Math.ceil(villagerOrder.length / 2));
  for (let i = 0; i < villagerOrder.length; i++) {
    const level = Math.min(15, completed.heartLevels[villagerOrder[i]] ?? 0);
    const byteIndex = Math.floor(i / 2);
    const nibble = i % 2 === 0 ? (level & 0xf) << 4 : level & 0xf;
    villagerBytes[byteIndex] |= nibble;
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
    const bits = encodeQuestState(stateVal);
    const byteIndex = Math.floor(i / 4);
    const bitOffset = (3 - (i % 4)) * 2;
    questBytes[byteIndex] |= (bits & 0x3) << bitOffset;
  }
  parts.push(questBytes);

  // 12. Perk bitfield
  const perkOrder = getPerkOrder();
  parts.push(toBitfield(perkOrder, completed.unlockedPerks));

  // 13. Pet cosmetic sets bitfield
  const petCosmeticOrder = getPetCosmeticOrder();
  parts.push(toBitfield(petCosmeticOrder, completed.petCosmetics));

  // 14. Pet skins bitfield
  const petSkinOrder = getPetSkinOrder();
  parts.push(toBitfield(petSkinOrder, completed.petSkins));

  // 15. Date bitfield
  const dateOrder = getDateOrder();
  parts.push(toBitfield(dateOrder, completed.dates));

  // 16. Progression byte — bits 7-6: reachedSeason, bit 5: hasUpperFloor
  const progressionByte =
    ((seasonOrdinal(completed.reachedSeason) & 0x3) << 6) | (completed.hasUpperFloor ? 0x20 : 0);
  parts.push(new Uint8Array([progressionByte]));

  // 17. Villager relationship states — 3 bits per dateable villager
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

  // 18. Child choice — 1 byte
  const childByte = encodeChildChoice(completed.childChoice);
  parts.push(new Uint8Array([childByte]));

  // 19. Almanac recipes bitfield
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

  // Compress, then prepend the version byte and an integrity checksum of the raw payload, and mark
  // the encoded result as a transfer code
  const compressed = await compressBytes(raw);
  const checksum = crc32(raw);
  const payload = new Uint8Array(1 + CHECKSUM_BYTE_LENGTH + compressed.length);
  payload[0] = TRANSFER_VERSION;
  payload[1] = (checksum >>> 24) & 0xff;
  payload[2] = (checksum >>> 16) & 0xff;
  payload[3] = (checksum >>> 8) & 0xff;
  payload[4] = checksum & 0xff;
  payload.set(compressed, 1 + CHECKSUM_BYTE_LENGTH);

  return TRANSFER_MAGIC + toBase64url(payload);
}

async function compressBytes(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decodeTransferPayloadUnchecked(payload: string): Promise<Partial<ProgressState>> {
  if (!payload.startsWith(TRANSFER_MAGIC)) {
    throw new TransferDecodeError("not-transfer-code", "Not a transfer payload: missing marker");
  }
  const payloadBytes = fromBase64url(payload.slice(TRANSFER_MAGIC.length));
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
  // Version 0 was never issued; it reads as outdated so the stale-code path stays testable until v2.
  if (version < MIN_SUPPORTED_TRANSFER_VERSION) {
    throw new TransferDecodeError(
      "outdated",
      "This QR code was created by an older version of Mistria Field Guide.",
    );
  }

  if (payloadBytes.length < 1 + CHECKSUM_BYTE_LENGTH) {
    throw new Error("Malformed transfer payload: missing integrity checksum");
  }
  const expectedChecksum =
    ((payloadBytes[1] << 24) |
      (payloadBytes[2] << 16) |
      (payloadBytes[3] << 8) |
      payloadBytes[4]) >>>
    0;
  const bodyStart = 1 + CHECKSUM_BYTE_LENGTH;

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

  if (crc32(raw) !== expectedChecksum) {
    throw new Error("Transfer payload failed integrity check: data may be corrupted");
  }

  const expectedLength = getTransferRawLength();
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
  const almanacOrder = getAlmanacOrder();
  const almanacBytes = readBytes(Math.ceil(almanacOrder.length / 8));
  const almanac = fromBitfield(almanacOrder, almanacBytes, "almanac bitfield") as Set<ItemId>;

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
    const existing = getOrCreate(animals, animalId, () => new Set<AnimalVariantId>());
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
    const existing = getOrCreate(animalCosmetics, animalId, () => new Set<CosmeticId>());
    existing.add(cosmeticId as CosmeticId);
  }

  // 5. Museum items
  const museumOrder = getMuseumOrder();
  const museumBytes = readBytes(Math.ceil(museumOrder.length / 8));
  const museum = fromBitfield(museumOrder, museumBytes, "museum bitfield") as Set<ItemId>;

  // 6. Spell bitmask (1 byte)
  const spellOrder = getSpellOrder();
  assertSpellBitmaskFits(spellOrder.length);
  const spellByte = readBytes(1)[0];
  assertZeroPadding(spellOrder.length, new Uint8Array([spellByte]), "spell reserved bits");
  const spells = new Set<SpellId>();
  for (let i = 0; i < spellOrder.length; i++) {
    if (spellByte & (1 << (7 - i))) {
      spells.add(spellOrder[i]);
    }
  }

  // 7. Mine floor (1 byte)
  const mineFloor = readBytes(1)[0];

  // 8. Renown (2 bytes big-endian uint16)
  const renownBytes = readBytes(2);
  const renown = (renownBytes[0] << 8) | renownBytes[1];

  // 9. Heart levels (4 bits each, high nibble first)
  const villagerOrder = getVillagerOrder();
  const villagerBytes = readBytes(Math.ceil(villagerOrder.length / 2));
  const heartLevels: Record<string, number> = {};
  for (let i = 0; i < villagerOrder.length; i++) {
    const byteIndex = Math.floor(i / 2);
    const level =
      i % 2 === 0 ? (villagerBytes[byteIndex] >> 4) & 0xf : villagerBytes[byteIndex] & 0xf;
    heartLevels[villagerOrder[i]] = level;
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

  // 12. Perk bitfield
  const perkOrder = getPerkOrder();
  const perkBytes = readBytes(Math.ceil(perkOrder.length / 8));
  const unlockedPerks = fromBitfield(perkOrder, perkBytes, "perk bitfield") as Set<PerkId>;

  // 13. Pet cosmetic sets bitfield
  const petCosmeticOrder = getPetCosmeticOrder();
  const petCosmeticBytes = readBytes(Math.ceil(petCosmeticOrder.length / 8));
  const petCosmetics = fromBitfield(
    petCosmeticOrder,
    petCosmeticBytes,
    "pet cosmetic bitfield",
  ) as Set<PetCosmeticSetId>;

  // 14. Pet skins bitfield
  const petSkinOrder = getPetSkinOrder();
  const petSkinBytes = readBytes(Math.ceil(petSkinOrder.length / 8));
  const petSkins = fromBitfield(petSkinOrder, petSkinBytes, "pet skin bitfield") as Set<PetSkinId>;

  // 15. Date bitfield
  const dateOrder = getDateOrder();
  const dateBytes = readBytes(Math.ceil(dateOrder.length / 8));
  const dates = fromBitfield(dateOrder, dateBytes, "date bitfield") as Set<DateId>;

  // 16. Progression byte — bits 7-6: reachedSeason, bit 5: hasUpperFloor, bits 4-0: reserved
  const progressionByte = readBytes(1)[0];
  if (progressionByte & 0x1f) {
    throw new Error("Invalid progression reserved bits: expected zero");
  }
  const reachedSeason: Season = seasonFromOrdinal((progressionByte >> 6) & 0x3);
  const hasUpperFloor = Boolean(progressionByte & 0x20);

  const villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>> = {};

  // 17. Villager relationship states — 3 bits per dateable villager
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
    const bits =
      bitShift >= 0
        ? (relBytes[byteIndex] >> bitShift) & 0x7
        : ((relBytes[byteIndex] << -bitShift) | (relBytes[byteIndex + 1] >> (8 + bitShift))) & 0x7;
    if (bits >= RELATIONSHIP_MAP.length) {
      throw new Error(`Invalid relationship state code: ${String(bits)}`);
    }
    const rel = RELATIONSHIP_MAP[bits];
    if (rel !== "undecided") {
      villagerRelationships[dateableOrder[i]] = rel;
    }
  }

  // 18. Child choice — 1 byte
  const childByte = readBytes(1)[0];
  if (childByte > 0x02) {
    throw new Error(`Invalid child choice code: ${String(childByte)}`);
  }
  const childChoice: ChildChoice = decodeChildChoice(childByte);

  // 19. Almanac recipes bitfield
  const recipeOrder = getRecipeOrder();
  const recipeBytes = readBytes(Math.ceil(recipeOrder.length / 8));
  const almanacRecipes = fromBitfield(recipeOrder, recipeBytes, "recipe bitfield") as Set<RecipeId>;

  applyMarriageCascade(villagerRelationships);

  for (const id of recordKeys(skillLevels)) {
    skillLevels[id] = Math.min(skillLevels[id], MAX_SKILL_LEVEL);
  }
  for (const id of recordKeys(heartLevels)) {
    heartLevels[id] = Math.min(heartLevels[id], MAX_HEART_LEVEL);
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
    heartLevels,
    mineFloor: clampMineFloor(mineFloor),
    museum,
    petCosmetics,
    petSkins,
    questStates,
    reachedSeason,
    renown: clampRenownLevel(renown),
    skillLevels,
    spells,
    unlockedPerks,
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
  const base64 = str.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch (error) {
    throw new Error("Malformed transfer payload: invalid base64url encoding", { cause: error });
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.codePointAt(i) ?? 0;
  }
  if (toBase64url(bytes) !== str) {
    throw new Error("Malformed transfer payload: non-canonical base64url encoding");
  }
  return bytes;
}

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

/** The spell bitmask is one byte; a ninth spell would shift by a negative amount and corrupt it. */
function assertSpellBitmaskFits(spellCount: number): void {
  if (spellCount > 8) {
    throw new Error(`Transfer spell bitmask holds 8 spells, found ${String(spellCount)}`);
  }
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
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
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
      c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crc32Table = table;
  return table;
}

function getTransferRawLength(): number {
  return (
    Math.ceil(getAlmanacOrder().length / 8) +
    Math.ceil(getCosmeticOrder().length / 8) +
    Math.ceil(getAnimalVariantOrder().length / 8) +
    Math.ceil(getAnimalCosmeticOrder().length / 8) +
    Math.ceil(getMuseumOrder().length / 8) +
    1 +
    1 +
    2 +
    Math.ceil(getVillagerOrder().length / 2) +
    getSkillOrder().length +
    Math.ceil(getQuestOrder().length / 4) +
    Math.ceil(getPerkOrder().length / 8) +
    Math.ceil(getPetCosmeticOrder().length / 8) +
    Math.ceil(getPetSkinOrder().length / 8) +
    Math.ceil(getDateOrder().length / 8) +
    1 +
    Math.ceil((getDateableVillagerOrder().length * 3) / 8) +
    1 +
    Math.ceil(getRecipeOrder().length / 8)
  );
}

function encodeQuestState(state: QuestState): number {
  if (state === "none") return 0;
  return state === "obtained" ? 1 : 2;
}

function encodeChildChoice(choice: ChildChoice): number {
  if (choice === "yes") return 0x01;
  return choice === "no" ? 0x02 : 0x00;
}

function decodeChildChoice(code: number): ChildChoice {
  if (code === 0x01) return "yes";
  return code === 0x02 ? "no" : "undeclared";
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function getAnimalCosmeticOrder(): { animalId: AnimalId; cosmeticId: CosmeticId }[] {
  const result: { animalId: AnimalId; cosmeticId: CosmeticId }[] = [];
  for (const [animalId, animal] of Object.entries(trackerData.animals).toSorted(([a], [b]) =>
    compareCodeUnits(a, b),
  )) {
    for (const cosmeticId of (Object.keys(animal.cosmetics) as CosmeticId[]).toSorted()) {
      result.push({ animalId: animalId as AnimalId, cosmeticId });
    }
  }
  return result;
}

function getAnimalVariantOrder(): { animalId: AnimalId; variantId: AnimalVariantId }[] {
  const result: { animalId: AnimalId; variantId: AnimalVariantId }[] = [];
  for (const [animalId, animal] of recordEntries(trackerData.animals).toSorted(([a], [b]) =>
    compareCodeUnits(a, b),
  )) {
    for (const tier of animal.variantTiers) {
      for (const [variantId, variant] of recordEntries(tier).toSorted(([a], [b]) =>
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
    .toSorted();
}

function getDateableVillagerOrder(): VillagerId[] {
  return (Object.keys(trackerData.villagers) as VillagerId[])
    .filter((id) => trackerData.villagers[id].dateable)
    .toSorted();
}

function getDateOrder(): DateId[] {
  return (Object.keys(trackerData.dates) as DateId[]).toSorted();
}

function getMuseumOrder(): ItemId[] {
  return recordValues(trackerData.museum)
    .flatMap(({ sets }) => recordValues(sets).flatMap(({ items }) => items))
    .toSorted();
}

function getPerkOrder(): PerkId[] {
  return recordValues(trackerData.skills)
    .flatMap((skill) => skill.perkTiers.flatMap((tier) => recordKeys(tier)))
    .toSorted();
}

function getPetCosmeticOrder(): PetCosmeticSetId[] {
  return (Object.keys(trackerData.pets.cosmetics) as PetCosmeticSetId[]).toSorted();
}

function getPetSkinOrder(): PetSkinId[] {
  return (Object.keys(trackerData.pets.skins) as PetSkinId[]).toSorted();
}

function getQuestOrder(): { type: string; questId: QuestId }[] {
  const result: { type: string; questId: QuestId }[] = [];
  for (const type of recordKeys(trackerData.quests).toSorted()) {
    for (const questId of recordKeys(trackerData.quests[type]).toSorted()) {
      result.push({ type, questId });
    }
  }
  return result;
}

function getRecipeOrder(): RecipeId[] {
  return (Object.keys(trackerData.recipes) as RecipeId[]).toSorted();
}

function getSkillOrder(): SkillId[] {
  return (Object.keys(trackerData.skills) as SkillId[]).toSorted();
}

function getSpellOrder(): SpellId[] {
  return (Object.keys(trackerData.mines.spells) as SpellId[]).toSorted();
}

function getVillagerOrder(): VillagerId[] {
  return (Object.keys(trackerData.villagers) as VillagerId[]).toSorted();
}

function toBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function toBitfield(ordered: string[], completedSet: ReadonlySet<string>): Uint8Array {
  const byteCount = Math.ceil(ordered.length / 8);
  const bytes = new Uint8Array(byteCount);
  for (let i = 0; i < ordered.length; i++) {
    if (completedSet.has(ordered[i])) {
      bytes[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
    }
  }
  return bytes;
}
