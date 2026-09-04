import { canonicalAlmanacId, trackerData } from "$lib/data/index.js";
import { normalizeRelationships } from "$lib/engine/relationships.js";
import { recordEntries, recordKeys, recordValues } from "$lib/utils";

import type { ChildChoice, CompletedState, QuestState } from "$lib/stores/user-state.svelte.js";
import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  DateId,
  ItemId,
  NpcId,
  NpcRelationship,
  PerkId,
  PetCosmeticSetId,
  PetSkinId,
  QuestId,
  RecipeId,
  Season,
  SkillId,
  SpellId,
} from "$lib/types/tracker-data.js";

// ─── Constants ──────────────────────────────────────────────────────

export const TRANSFER_VERSION = 8;

const SEASON_BY_ORD: Season[] = ["spring", "summer", "fall", "winter"];
const SEASON_ORD: Record<Season, number> = { fall: 2, spring: 0, summer: 1, winter: 3 };
const HISTORICAL_RAW_LENGTHS: Partial<Record<number, number>> = { 5: 790 };

// ─── Deterministic orderings (derived from trackerData) ─────────────

/** Decode base64url string → Partial<CompletedState> for merging */
export async function decodeTransferPayload(payload: string): Promise<Partial<CompletedState>> {
  const payloadBytes = fromBase64url(payload);
  if (payloadBytes.length === 0) {
    throw new Error("Malformed transfer payload: missing version byte");
  }
  const version = payloadBytes[0];
  if (version < 1 || version > TRANSFER_VERSION) {
    throw new Error(`Unsupported transfer version: ${String(version)}`);
  }

  const compressed = payloadBytes.slice(1);
  if (compressed.length === 0) {
    throw new Error("Invalid compressed transfer payload: missing compressed data");
  }

  let raw: Uint8Array;
  try {
    raw = await decompressBytes(compressed);
  } catch (error) {
    throw new Error("Invalid compressed transfer payload", { cause: error });
  }

  const expectedLength = HISTORICAL_RAW_LENGTHS[version] ?? getTransferRawLength(version);
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
  const rawAlmanac = fromBitfield(almanacOrder, almanacBytes) as Set<ItemId>;
  const almanac =
    version >= 6
      ? rawAlmanac
      : new Set([...rawAlmanac].map((id) => canonicalAlmanacId.get(id) ?? id));

  // 2. Cosmetics (non-default-unlocked)
  const cosmeticOrder = getCosmeticOrder();
  const cosmeticBytes = readBytes(Math.ceil(cosmeticOrder.length / 8));
  const cosmetics = fromBitfield(cosmeticOrder, cosmeticBytes) as Set<CosmeticId>;

  // 3. Animal variants (non-default-unlocked)
  const animalVariantOrder = getAnimalVariantOrder();
  const animalVariantKeys = animalVariantOrder.map((v) => `${v.animalId}:${v.variantId}`);
  const animalVariantBytes = readBytes(Math.ceil(animalVariantKeys.length / 8));
  const animalVariantSet = fromBitfield(animalVariantKeys, animalVariantBytes);
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
  const animalCosmeticSet = fromBitfield(animalCosmeticKeys, animalCosmeticBytes);
  const animalCosmetics: Record<string, Set<CosmeticId>> = {};
  for (const key of animalCosmeticSet) {
    const [animalId, cosmeticId] = key.split(":");
    const existing = (animalCosmetics[animalId] ??= new Set<CosmeticId>());
    existing.add(cosmeticId as CosmeticId);
  }

  // 5. Museum items
  const museumOrder = getMuseumOrder();
  const museumBytes = readBytes(Math.ceil(museumOrder.length / 8));
  const museum = fromBitfield(museumOrder, museumBytes) as Set<ItemId>;

  // 6. Spell bitmask (1 byte)
  const spellOrder = getSpellOrder();
  const spellByte = readBytes(1)[0];
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

  // 9. NPC levels (4 bits each, high nibble first)
  const npcOrder = getNpcOrder();
  const npcBytes = readBytes(Math.ceil(npcOrder.length / 2));
  const npcLevels: Record<string, number> = {};
  for (let i = 0; i < npcOrder.length; i++) {
    const byteIndex = Math.floor(i / 2);
    const level = i % 2 === 0 ? (npcBytes[byteIndex] >> 4) & 0xf : npcBytes[byteIndex] & 0xf;
    npcLevels[npcOrder[i]] = level;
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
  const questStates: Record<string, QuestState> = {};
  const questStateMap: QuestState[] = ["none", "obtained", "completed"];
  for (let i = 0; i < questOrder.length; i++) {
    const byteIndex = Math.floor(i / 4);
    const bitOffset = (3 - (i % 4)) * 2;
    const bits = (questBytes[byteIndex] >> bitOffset) & 0x3;
    questStates[questOrder[i].questId] = questStateMap[bits];
  }

  // 12. Perk bitfield (v2 only)
  // 13. Married NPC index (v2 only) — 1 byte: 0xFF = no spouse, else index into npcOrder
  let unlockedPerks = new Set<PerkId>();
  let marriedNpc: NpcId | null = null;

  if (version >= 2) {
    const perkOrder = getPerkOrder();
    const perkBytes = readBytes(Math.ceil(perkOrder.length / 8));
    unlockedPerks = fromBitfield(perkOrder, perkBytes) as Set<PerkId>;

    const marriedByte = readBytes(1)[0];
    if (marriedByte !== 0xff) {
      marriedNpc = npcOrder[marriedByte] ?? null;
    }
  }

  // 14. Pet cosmetic sets bitfield (v3 only)
  // 15. Pet skins bitfield (v3 only)
  let petCosmetics = new Set<PetCosmeticSetId>();
  let petSkins = new Set<PetSkinId>();

  if (version >= 3) {
    const petCosmeticOrder = getPetCosmeticOrder();
    const petCosmeticBytes = readBytes(Math.ceil(petCosmeticOrder.length / 8));
    petCosmetics = fromBitfield(petCosmeticOrder, petCosmeticBytes) as Set<PetCosmeticSetId>;

    const petSkinOrder = getPetSkinOrder();
    const petSkinBytes = readBytes(Math.ceil(petSkinOrder.length / 8));
    petSkins = fromBitfield(petSkinOrder, petSkinBytes) as Set<PetSkinId>;
  }

  // 16. Date bitfield (v4 only)
  let dates = new Set<DateId>();
  if (version >= 4) {
    const dateOrder = getDateOrder();
    const dateBytes = readBytes(Math.ceil(dateOrder.length / 8));
    dates = fromBitfield(dateOrder, dateBytes) as Set<DateId>;
  }

  // 17. Progression byte (v5 only) — bits 7-6: reachedSeason, bit 5: hasUpperFloor, bits 4-0: reserved
  // 18. Romantic NPC bitfield (v5 only)
  let hasUpperFloor = false;
  let reachedSeason: Season = "spring";
  const npcRelationships: Partial<Record<NpcId, NpcRelationship>> = {};

  if (version >= 5) {
    const progressionByte = readBytes(1)[0];
    reachedSeason = SEASON_BY_ORD[(progressionByte >> 6) & 0x3];
    hasUpperFloor = !!(progressionByte & 0x20);

    const romanticOrder = getDateableNpcOrder();
    const romanticBytes = readBytes(Math.ceil(romanticOrder.length / 8));
    const romanticNpcs = fromBitfield(romanticOrder, romanticBytes) as Set<NpcId>;

    for (const npcId of romanticNpcs) {
      npcRelationships[npcId] = "romantic";
    }
  }

  if (marriedNpc) {
    npcRelationships[marriedNpc] = "married";
  }

  // 19. NPC relationship states (v7) — 3 bits per dateable NPC
  // 20. Child choice (v7) — 1 byte
  let childChoice: ChildChoice = "undeclared";

  if (version >= 7) {
    const dateableOrder = getDateableNpcOrder();
    const relByteCount = Math.ceil((dateableOrder.length * 3) / 8);
    const relBytes = readBytes(relByteCount);
    const RELATIONSHIP_MAP: NpcRelationship[] = [
      "undecided",
      "platonic",
      "romantic",
      "proposed",
      "married",
    ];
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
      const rel = RELATIONSHIP_MAP[bits] ?? "undecided";
      if (rel !== "undecided") {
        npcRelationships[dateableOrder[i]] = rel;
      }
    }

    const childByte = readBytes(1)[0];
    childChoice = childByte === 0x01 ? "yes" : childByte === 0x02 ? "no" : "undeclared";
  }

  // 21. Almanac recipes bitfield (v8+)
  let almanacRecipes = new Set<RecipeId>();
  if (version >= 8) {
    const recipeOrder = getRecipeOrder();
    const recipeBytes = readBytes(Math.ceil(recipeOrder.length / 8));
    almanacRecipes = fromBitfield(recipeOrder, recipeBytes) as Set<RecipeId>;
  }

  normalizeRelationships(npcRelationships);

  return {
    almanac,
    almanacRecipes,
    animalCosmetics,
    animals,
    childChoice,
    cosmetics,
    dates,
    hasUpperFloor,
    mines: { floor, spells },
    museum,
    npcLevels,
    npcRelationships,
    petCosmetics,
    petSkins,
    questStates,
    reachedSeason,
    renown,
    skillLevels,
    unlockedPerks,
  };
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

  // 9. NPC levels (4 bits each, high nibble first)
  const npcOrder = getNpcOrder();
  const npcBytes = new Uint8Array(Math.ceil(npcOrder.length / 2));
  for (let i = 0; i < npcOrder.length; i++) {
    const level = Math.min(15, completed.npcLevels[npcOrder[i]] ?? 0);
    const byteIndex = Math.floor(i / 2);
    if (i % 2 === 0) {
      npcBytes[byteIndex] |= (level & 0xf) << 4;
    } else {
      npcBytes[byteIndex] |= level & 0xf;
    }
  }
  parts.push(npcBytes);

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

  // 13. Married NPC index (v2+, still written for v6 backward compat)
  const marriedNpc = Object.entries(completed.npcRelationships).find(
    ([, r]) => r === "married",
  )?.[0] as NpcId | undefined;
  const marriedIndex = marriedNpc ? npcOrder.indexOf(marriedNpc) : -1;
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

  // 18. Romantic NPC bitfield (v5+, still written for v6 backward compat)
  const romanticOrder = getDateableNpcOrder();
  const romanticSet = new Set<string>();
  for (const [id, rel] of Object.entries(completed.npcRelationships)) {
    if (rel === "romantic" || rel === "proposed" || rel === "married") {
      romanticSet.add(id);
    }
  }
  parts.push(toBitfield(romanticOrder, romanticSet));

  // 19. NPC relationship states (new in v7) — 3 bits per dateable NPC
  const RELATIONSHIP_ENCODE: Record<NpcRelationship, number> = {
    married: 4,
    platonic: 1,
    proposed: 3,
    romantic: 2,
    undecided: 0,
  };
  const dateableOrder = getDateableNpcOrder();
  const relBitCount = dateableOrder.length * 3;
  const relByteCount = Math.ceil(relBitCount / 8);
  const relBytes = new Uint8Array(relByteCount);
  for (let i = 0; i < dateableOrder.length; i++) {
    const rel = completed.npcRelationships[dateableOrder[i]] ?? "undecided";
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

  // Compress and prepend version byte
  const compressed = await compressBytes(raw);
  const payload = new Uint8Array(1 + compressed.length);
  payload[0] = TRANSFER_VERSION;
  payload.set(compressed, 1);

  return toBase64url(payload);
}

async function compressBytes(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
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

function fromBitfield(ordered: string[], bytes: Uint8Array): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < ordered.length; i++) {
    if (bytes[Math.floor(i / 8)] & (1 << (7 - (i % 8)))) {
      result.add(ordered[i]);
    }
  }
  return result;
}

function getAlmanacOrder(): ItemId[] {
  const canonicalIds = recordValues(trackerData.almanac).flatMap(({ items }) =>
    items.map((entry) => entry.itemIds[0]),
  );
  return [...new Set(canonicalIds)].toSorted();
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
    Math.ceil(getNpcOrder().length / 2) +
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
    length += 1 + Math.ceil(getDateableNpcOrder().length / 8);
  }
  if (version >= 7) {
    length += Math.ceil((getDateableNpcOrder().length * 3) / 8) + 1;
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

function getAnimalCosmeticOrder(): { animalId: AnimalId; cosmeticId: CosmeticId }[] {
  const result: { animalId: AnimalId; cosmeticId: CosmeticId }[] = [];
  for (const [animalId, animal] of Object.entries(trackerData.animals).sort(([a], [b]) =>
    a.localeCompare(b),
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
    a.localeCompare(b),
  )) {
    for (const tier of animal.variantTiers) {
      for (const [variantId, variant] of recordEntries(tier).sort(([a], [b]) =>
        a.localeCompare(b),
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

function getDateableNpcOrder(): NpcId[] {
  return (Object.keys(trackerData.npcs) as NpcId[])
    .filter((id) => trackerData.npcs[id].dateable)
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

function getNpcOrder(): NpcId[] {
  return (Object.keys(trackerData.npcs) as NpcId[]).sort();
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

// ─── Base64url ──────────────────────────────────────────────────────

function getSkillOrder(): SkillId[] {
  return (Object.keys(trackerData.skills) as SkillId[]).sort();
}

function getSpellOrder(): SpellId[] {
  return (Object.keys(trackerData.mines.spells) as SpellId[]).sort();
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
