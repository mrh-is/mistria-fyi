import { trackerData } from "$lib/data/index.js";
import { recordEntries, recordKeys, recordValues } from "$lib/utils";

import type { CompletedState, QuestState } from "$lib/stores/user-state.svelte.js";
import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  DateId,
  ItemId,
  NpcId,
  PerkId,
  PetCosmeticSetId,
  PetSkinId,
  QuestId,
  Season,
  SkillId,
  SpellId,
} from "$lib/types/tracker-data.js";

// ─── Constants ──────────────────────────────────────────────────────

export const TRANSFER_VERSION = 5;

const SEASON_BY_ORD: Season[] = ["spring", "summer", "fall", "winter"];
const SEASON_ORD: Record<Season, number> = { fall: 2, spring: 0, summer: 1, winter: 3 };

// ─── Deterministic orderings (derived from trackerData) ─────────────

/** Decode base64url string → Partial<CompletedState> for merging */
export async function decodeTransferPayload(payload: string): Promise<Partial<CompletedState>> {
  const payloadBytes = fromBase64url(payload);
  const version = payloadBytes[0];
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5) {
    throw new Error(`Unsupported transfer version: ${String(version)}`);
  }

  const compressed = payloadBytes.slice(1);
  const raw = await decompressBytes(compressed);

  let offset = 0;

  function readBytes(count: number): Uint8Array {
    const slice = raw.slice(offset, offset + count);
    offset += count;
    return slice;
  }

  // 1. Almanac items
  const almanacOrder = getAlmanacOrder();
  const almanacBytes = readBytes(Math.ceil(almanacOrder.length / 8));
  const almanac = fromBitfield(almanacOrder, almanacBytes) as Set<ItemId>;

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
  let romanticNpcs = new Set<NpcId>();

  if (version >= 5) {
    const progressionByte = readBytes(1)[0];
    reachedSeason = SEASON_BY_ORD[(progressionByte >> 6) & 0x3];
    hasUpperFloor = !!(progressionByte & 0x20);

    const romanticOrder = getDateableNpcOrder();
    const romanticBytes = readBytes(Math.ceil(romanticOrder.length / 8));
    romanticNpcs = fromBitfield(romanticOrder, romanticBytes) as Set<NpcId>;
  }

  return {
    almanac,
    animalCosmetics,
    animals,
    cosmetics,
    dates,
    hasUpperFloor,
    marriedNpc,
    mines: { floor, spells },
    museum,
    npcLevels,
    petCosmetics,
    petSkins,
    questStates,
    reachedSeason,
    renown,
    romanticNpcs,
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

  // 13. Married NPC index (new in v2) — 1 byte: 0xFF = no spouse, else index into npcOrder
  const marriedIndex = completed.marriedNpc ? npcOrder.indexOf(completed.marriedNpc) : -1;
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

  // 18. Romantic NPC bitfield (new in v5)
  const romanticOrder = getDateableNpcOrder();
  parts.push(toBitfield(romanticOrder, completed.romanticNpcs));

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
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  void writer.write(data as ArrayBufferView<ArrayBuffer>);
  void writer.close();

  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function decompressBytes(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  void writer.write(data as ArrayBufferView<ArrayBuffer>);
  void writer.close();

  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function fromBase64url(str: string): Uint8Array {
  // Restore standard base64 characters and padding
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
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
  return recordValues(trackerData.almanac).flatMap(({ items }) => items.toSorted());
}

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

// ─── Bitfield helpers ───────────────────────────────────────────────

function getCosmeticOrder(): CosmeticId[] {
  return (Object.keys(trackerData.cosmetics) as CosmeticId[])
    .filter((id) => !trackerData.cosmetics[id].sources.some((s) => s.type === "default"))
    .sort();
}

function getDateableNpcOrder(): NpcId[] {
  return (Object.keys(trackerData.npcs) as NpcId[])
    .filter((id) => trackerData.npcs[id].dateable)
    .sort();
}

function getDateOrder(): DateId[] {
  return (Object.keys(trackerData.dates) as DateId[]).sort();
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
