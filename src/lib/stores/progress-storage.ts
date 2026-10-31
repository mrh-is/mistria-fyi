/**
 * The persisted progress blob, which is also the JSON backup: its Valibot schema, the numbered
 * migrations that bring an older blob up to this build's version, & the reader both storage
 * hydration & backup restore go through. The store owns storage access & the persistence lifecycle;
 * this module only turns text into progress & back.
 *
 * Each way data enters the store keeps a thin policy above validation:
 *
 * - **Hydration repairs** (`"repair"`): a malformed value falls back to its default, a malformed
 *   record entry is dropped, and only an unreadable structure is quarantined.
 * - **Backup restore is strict** (`"strict"`): any malformed or out-of-domain value rejects the whole
 *   document, so a restore never half-applies.
 * - **Save import warns** (`#lib/engine/import-save.js`): it reads the game's save, not this blob.
 * - **Transfer is all-or-nothing** (`#lib/engine/transfer.js`): a build-bound binary payload.
 *
 * Neither policy drops an ID this build's tracker data doesn't know: those entries are retained
 * beside the progress & written back, so a renamed or newer ID survives until a migration or a
 * newer build claims it.
 */
import { SvelteSet } from "svelte/reactivity";
import * as v from "valibot";

import { trackerData, trackerIndex } from "#lib/data/index.js";
import { trackedPerkIds } from "#lib/engine/perk-ids.js";
import {
  clampLevel,
  clampMineFloor,
  clampRenownLevel,
  getMaxMineFloor,
  MAX_HEART_LEVEL,
  MAX_SKILL_LEVEL,
} from "#lib/engine/progress.js";
import { factKey, progressFacts, PROVENANCE_SOURCES } from "#lib/engine/provenance.js";
import { applyEngagementCascade } from "#lib/engine/relationships.js";
import { SEASONS, VILLAGER_RELATIONSHIPS, WEATHERS } from "#lib/types/tracker-data.js";
import {
  CHILD_CHOICES,
  CURRENT_SERIALIZATION_VERSION,
  QUEST_STATES,
} from "#lib/types/user-progress.js";
import { recordEntries, recordKeys } from "#lib/utils/record.js";

import type { ProgressHistory, ResolutionRecord } from "#lib/engine/provenance.js";
import type { SaveImportMetadata } from "#lib/types/save-identity.js";
import type {
  AnimalId,
  AnimalVariantId,
  CosmeticId,
  ItemId,
  Season,
  VillagerId,
  VillagerRelationship,
  Weather,
} from "#lib/types/tracker-data.js";
import type { ProgressState, QuestState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

// ─── Migrations ─────────────────────────────────────────────────────

/** A parsed blob on its way up the migration chain. */
export type StoredDocument = Record<string, unknown>;
export type Migration = (document: StoredDocument) => StoredDocument;

/**
 * `MIGRATIONS[n]` turns a version `n − 1` document into version `n`. Version 1 is the launch
 * format, so its step is the identity & the chain's base. A format change bumps
 * `CURRENT_SERIALIZATION_VERSION`, adds the step that produces it, and adds its fixture under
 * `progress-storage-fixtures/`; `progress-storage.test.ts` fails until all three exist.
 */
export const MIGRATIONS: Readonly<Partial<Record<number, Migration>>> = {
  1: (document) => document,
  // Earlier builds recorded neither an identity nor an import timestamp. Do not invent either.
  2: (document) => ({ ...document, lastImport: null }),
  // Version 3 adds provenance & resolutions. Every fact a version 2 blob holds predates provenance,
  // so it's marked `unknown`; nothing has been resolved yet. The facts are read the way hydration
  // reads them, so each key names a fact it stores.
  3: (document) => {
    if (!isPlainObject(document.progress)) return document;
    const read = v.safeParse(RepairBlobSchema, document);
    if (!read.success) return document;
    const loaded = normalizeBlob(read.output);
    const provenance = {
      ...Object.fromEntries(storedFactKeys(loaded).map((key) => [key, { source: "unknown" }])),
      // A cascade hydration applied is the app's inference, recorded as such.
      ...loaded.history.provenance,
    };
    return { ...document, progress: { ...document.progress, provenance, resolutions: {} } };
  },
  // Dates was a duplicate manual checklist, not evidence of acquiring an inspiration item.
  // Retire it without changing canonical Almanac progress or its history.
  4: (document) => {
    if (!isPlainObject(document.progress)) return document;
    const progress = Object.fromEntries(
      Object.entries(document.progress).filter(([key]) => key !== "dates" && key !== "legacyDates"),
    );
    for (const field of ["provenance", "resolutions"]) {
      const history = progress[field];
      if (isPlainObject(history)) {
        progress[field] = Object.fromEntries(
          Object.entries(history).filter(([key]) => !key.startsWith("dates/")),
        );
      }
    }
    return { ...document, progress };
  },
  5: (document) => document,
  // Version 6 lets a completed quest's provenance name its obtained moment's source. An older
  // quest has no record of that moment, so nothing is backfilled & it draws in its own source.
  6: (document) => document,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The key of every fact loaded progress holds, retained unknown IDs included. */
function storedFactKeys({ progress, retained }: Pick<LoadedProgress, "progress" | "retained">) {
  const keys = [...progressFacts(progress).keys()];
  for (const [field, ids] of recordEntries(retained.lists)) {
    for (const id of ids) keys.push(factKey(field, id));
  }
  for (const field of ["animalCosmetics", "animals"] as const) {
    for (const [animalId, ids] of recordEntries(retained[field])) {
      for (const id of ids) keys.push(factKey(field, animalId, id));
    }
  }
  for (const field of ["heartLevels", "questStates", "skillLevels", "villagerRelationships"]) {
    for (const id of Object.keys(retained[field as keyof RetainedProgress])) {
      keys.push(factKey(field, id));
    }
  }
  return keys;
}

/**
 * Runs every step after `from` up to `to`, stamping each result with the version it produced. Throws
 * on a gap in the chain, which is a build error rather than bad data.
 */
export function migrateDocument(
  document: StoredDocument,
  from: number,
  migrations: Readonly<Partial<Record<number, Migration>>> = MIGRATIONS,
  to: number = CURRENT_SERIALIZATION_VERSION,
): StoredDocument {
  let migrated = document;
  for (let version = from + 1; version <= to; version++) {
    const step = migrations[version];
    if (!step) throw new Error(`No storage migration produces version ${version}`);
    migrated = { ...step(migrated), version };
  }
  return migrated;
}

// ─── Schema ─────────────────────────────────────────────────────────

/**
 * Version 1 backups once allowed 12 hearts, above the game's real maximum of 10. Strict restore
 * still accepts those levels, and normalization clamps them to `MAX_HEART_LEVEL`.
 */
const LEGACY_MAX_HEART_LEVEL = 12;

const VersionSchema = v.pipe(v.number(), v.integer(), v.minValue(1));
const EnvelopeSchema = v.looseObject({ version: VersionSchema });

const StringListSchema = v.array(v.string());
const FiniteNumberSchema = v.pipe(v.number(), v.finite());

const VersionPartSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const LastImportSchema = v.nullable(
  v.object({
    farmName: v.nullable(v.string()),
    identity: v.object({
      creationVersion: v.nullable(
        v.object({
          major: VersionPartSchema,
          minor: VersionPartSchema,
          patch: VersionPartSchema,
          pre: v.nullable(v.string()),
        }),
      ),
      saveNumber: v.nullable(v.pipe(v.string(), v.regex(/^\d+$/))),
    }),
    importedAt: v.pipe(FiniteNumberSchema, v.minValue(0), v.maxValue(8_640_000_000_000_000)),
    playerName: v.nullable(v.string()),
  }),
);

function domainInteger(max: number) {
  return v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(max));
}

/**
 * Strict levels keyed by ID. A known ID's level must be an integer in this build's domain; an
 * unknown ID's is a retained entry, kept as its own build stored it, so any finite non-negative
 * level is accepted. Hydration retains exactly that shape, so whatever it writes restores.
 */
function strictLevels(knownIds: object, max: number) {
  const knownLevel = domainInteger(max);
  return v.pipe(
    v.record(v.string(), v.pipe(FiniteNumberSchema, v.minValue(0))),
    v.check((levels) =>
      Object.entries(levels).every(
        ([id, level]) => !Object.hasOwn(knownIds, id) || v.is(knownLevel, level),
      ),
    ),
  );
}

/** A record whose entries failing `schema` are dropped rather than failing the whole record. */
function validEntries<TOutput>(schema: v.GenericSchema<unknown, TOutput>) {
  return v.pipe(
    v.record(v.string(), v.unknown()),
    v.transform(
      (record) =>
        Object.fromEntries(
          Object.entries(record).filter(([, value]) => v.is(schema, value)),
        ) as Record<string, TOutput>,
    ),
  );
}

/** Lists every policy requires to be well formed; without them the blob isn't progress. */
const LIST_ENTRIES = {
  almanac: StringListSchema,
  almanacRecipes: v.optional(StringListSchema),
  cosmetics: StringListSchema,
  mountAppearances: v.optional(StringListSchema),
  museum: StringListSchema,
  petCosmetics: v.optional(StringListSchema),
  petSkins: v.optional(StringListSchema),
  spells: StringListSchema,
  unlockedPerks: v.optional(StringListSchema),
};

const PlaytimeSchema = v.pipe(FiniteNumberSchema, v.minValue(0));
const FactProvenanceSchema = v.object({
  obtainedSource: v.optional(v.picklist(PROVENANCE_SOURCES)),
  playtime: v.optional(PlaytimeSchema),
  source: v.picklist(PROVENANCE_SOURCES),
});
const ResolutionSchema = v.object({
  saveValue: v.custom<unknown>((value) => value !== undefined),
});

const StrictBlobSchema = v.object({
  lastImport: v.optional(LastImportSchema, null),
  progress: v.object({
    ...LIST_ENTRIES,
    animalCosmetics: v.record(v.string(), StringListSchema),
    animals: v.record(v.string(), StringListSchema),
    breakUpsDisabled: v.optional(v.boolean()),
    childChoice: v.optional(v.picklist(CHILD_CHOICES)),
    hasUpperFloor: v.optional(v.boolean()),
    heartLevels: v.optional(strictLevels(trackerData.villagers, LEGACY_MAX_HEART_LEVEL)),
    lastSavePlaytime: v.optional(PlaytimeSchema),
    mineFloor: domainInteger(getMaxMineFloor()),
    provenance: v.optional(v.record(v.string(), FactProvenanceSchema)),
    questStates: v.optional(v.record(v.string(), v.picklist(QUEST_STATES))),
    reachedSeason: v.optional(v.picklist(SEASONS)),
    renown: FiniteNumberSchema,
    resolutions: v.optional(v.record(v.string(), ResolutionSchema)),
    skillLevels: v.optional(strictLevels(trackerData.skills, MAX_SKILL_LEVEL)),
    villagerRelationships: v.optional(v.record(v.string(), v.picklist(VILLAGER_RELATIONSHIPS))),
  }),
  version: VersionSchema,
  worldState: v.object({ season: v.picklist(SEASONS), weather: v.picklist(WEATHERS) }),
});

/**
 * This device's own data under the progress key, which never leaves it: exports leave it out and
 * a restore keeps this device's. Its slots are reserved for sync: `syncReceipt` (what this device
 * last applied) & `farmSwitchBackup` (progress saved before switching farms). Their shapes belong to
 * the sync work that fills them, so they're carried through as stored, unknown keys included.
 */
const DeviceLocalSchema = v.looseObject({
  farmSwitchBackup: v.optional(v.unknown()),
  syncReceipt: v.optional(v.unknown()),
});
export type DeviceLocalState = v.InferOutput<typeof DeviceLocalSchema>;

const RepairBlobSchema = v.object({
  lastImport: v.fallback(v.optional(LastImportSchema, null), null),
  // Only storage holds this section; the strict schema strips it, so no restore brings one in.
  local: v.fallback(v.optional(DeviceLocalSchema), undefined),
  progress: v.object({
    ...LIST_ENTRIES,
    animalCosmetics: validEntries(StringListSchema),
    animals: validEntries(StringListSchema),
    breakUpsDisabled: v.fallback(v.optional(v.boolean()), undefined),
    childChoice: v.fallback(v.optional(v.picklist(CHILD_CHOICES)), undefined),
    hasUpperFloor: v.fallback(v.optional(v.boolean()), undefined),
    heartLevels: v.optional(validEntries(FiniteNumberSchema)),
    lastSavePlaytime: v.fallback(v.optional(PlaytimeSchema), undefined),
    mineFloor: v.fallback(FiniteNumberSchema, 0),
    // History is no reason to quarantine progress, so a malformed container is dropped whole.
    provenance: v.fallback(v.optional(validEntries(FactProvenanceSchema)), undefined),
    questStates: v.optional(validEntries(v.picklist(QUEST_STATES))),
    reachedSeason: v.fallback(v.optional(v.picklist(SEASONS)), undefined),
    renown: v.fallback(FiniteNumberSchema, 0),
    resolutions: v.fallback(v.optional(validEntries(ResolutionSchema)), undefined),
    skillLevels: v.optional(validEntries(FiniteNumberSchema)),
    villagerRelationships: v.optional(validEntries(v.picklist(VILLAGER_RELATIONSHIPS))),
  }),
  version: VersionSchema,
  worldState: v.object({
    season: v.fallback(v.picklist(SEASONS), "spring"),
    weather: v.fallback(v.picklist(WEATHERS), "calm"),
  }),
});

/**
 * The persisted progress blob, also the JSON backup. Field names, the key, & the version are a
 * public contract (see `docs/app-architecture.md` §3); `user-state-golden.test.ts` pins them. A
 * shape change adds a migration rather than loosening a field.
 */
export type SerializedState = v.InferInput<typeof StrictBlobSchema>;
type ValidatedBlob = v.InferOutput<typeof RepairBlobSchema>;

/** How strictly an ingress path treats a malformed value; see the module comment. */
export type IngressPolicy = "repair" | "strict";

const SCHEMAS = {
  repair: RepairBlobSchema,
  strict: StrictBlobSchema,
} satisfies Record<IngressPolicy, v.GenericSchema<unknown, ValidatedBlob>>;

// ─── Reading ────────────────────────────────────────────────────────

export interface WorldState {
  season: Season;
  weather: Weather;
}

const LIST_FIELDS = [
  "almanac",
  "almanacRecipes",
  "cosmetics",
  "mountAppearances",
  "museum",
  "petCosmetics",
  "petSkins",
  "spells",
  "unlockedPerks",
] as const satisfies readonly (keyof SerializedState["progress"])[];
type ListField = (typeof LIST_FIELDS)[number];

/**
 * Stored entries whose IDs this build's tracker data doesn't know. They stay out of
 * `ProgressState`, so counts & completion ignore them, and are written back unchanged.
 */
export interface RetainedProgress {
  animalCosmetics: Record<string, string[]>;
  animals: Record<string, string[]>;
  heartLevels: Record<string, number>;
  lists: Partial<Record<ListField, string[]>>;
  questStates: Record<string, QuestState>;
  skillLevels: Record<string, number>;
  villagerRelationships: Record<string, VillagerRelationship>;
}

export function emptyProgressHistory(): ProgressHistory {
  return { provenance: {}, resolutions: {} };
}

export interface LoadedProgress {
  history: ProgressHistory;
  lastImport: null | SaveImportMetadata;
  /** This device's own section; always empty from a backup. */
  local: DeviceLocalState;
  progress: ProgressState;
  retained: RetainedProgress;
  worldState: WorldState;
}

/** Why a document couldn't be read; unreadable stored data is quarantined. */
export type UnreadableKind = "invalid-fields" | "malformed-json";

export type ProgressReadResult =
  | { error: UnreadableKind; kind: "unreadable" }
  | { kind: "newer"; version: number }
  | { kind: "ok"; loaded: LoadedProgress };

export function emptyRetainedProgress(): RetainedProgress {
  return {
    animalCosmetics: {},
    animals: {},
    heartLevels: {},
    lists: {},
    questStates: {},
    skillLevels: {},
    villagerRelationships: {},
  };
}

/**
 * Reads a stored blob or backup: parse, dispatch on its version, migrate it to this build's, then
 * validate under `policy` & normalize against tracker data. A version above this build's is
 * reported as `newer` rather than read, so a stale tab or old build never overwrites it.
 */
export function readProgressBlob(json: string, policy: IngressPolicy): ProgressReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: "malformed-json", kind: "unreadable" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { error: "malformed-json", kind: "unreadable" };
  }

  const envelope = v.safeParse(EnvelopeSchema, parsed);
  if (!envelope.success) return { error: "invalid-fields", kind: "unreadable" };
  const { version } = envelope.output;
  if (version > CURRENT_SERIALIZATION_VERSION) return { kind: "newer", version };

  const migrated = migrateDocument(envelope.output, version);
  const blob = v.safeParse(SCHEMAS[policy], migrated);
  if (!blob.success) return { error: "invalid-fields", kind: "unreadable" };
  return { kind: "ok", loaded: normalizeBlob(blob.output) };
}

const QUEST_IDS = new Set(
  Object.values(trackerData.quests).flatMap((quests) => Object.keys(quests)),
);
const MUSEUM_ITEM_IDS = new Set(
  Object.values(trackerData.museum).flatMap((wing) =>
    Object.values(wing.sets).flatMap((set) => set.items),
  ),
);
const PERK_IDS = new Set<string>(trackedPerkIds(trackerData));

type KnownIds = object | ReadonlySet<string>;

const LIST_KNOWN_IDS: Record<Exclude<ListField, "almanac">, KnownIds> = {
  almanacRecipes: trackerData.recipes,
  cosmetics: trackerData.cosmetics,
  mountAppearances: trackerData.mount.appearances,
  museum: MUSEUM_ITEM_IDS,
  petCosmetics: trackerData.pets.cosmetics,
  petSkins: trackerData.pets.skins,
  spells: trackerData.mines.spells,
  unlockedPerks: PERK_IDS,
};

function hasKnownId(knownIds: KnownIds, id: string): boolean {
  return knownIds instanceof Set ? knownIds.has(id) : Object.hasOwn(knownIds, id);
}

/** Splits `ids` into a reactive set of known IDs & a list of the unknown ones. */
function splitIds<T extends string>(
  ids: readonly string[],
  isKnown: (id: string) => boolean,
): { known: Set<T>; unknown: string[] } {
  const known = new SvelteSet<T>();
  const unknown: string[] = [];
  for (const id of ids) {
    if (isKnown(id)) known.add(id as T);
    else unknown.push(id);
  }
  return { known, unknown };
}

/** Splits a record by key, keeping only entries `keep` accepts on either side. */
function splitRecord<V>(
  record: Partial<Record<string, V>>,
  knownIds: KnownIds,
  keep: (value: V) => boolean,
): { known: Record<string, V>; unknown: Record<string, V> } {
  const known: Record<string, V> = {};
  const unknown: Record<string, V> = {};
  for (const [id, value] of recordEntries(record)) {
    if (!keep(value)) continue;
    if (hasKnownId(knownIds, id)) known[id] = value;
    else unknown[id] = value;
  }
  return { known, unknown };
}

/**
 * Splits levels by ID, clamping known levels to this build's domain. An unknown ID's level is kept
 * as stored, since the build that knows the ID may allow a higher maximum.
 */
function splitLevels(
  record: Partial<Record<string, number>> | undefined,
  knownIds: KnownIds,
  max: number,
): { known: Record<string, number>; unknown: Record<string, number> } {
  const { known, unknown } = splitRecord(record ?? {}, knownIds, (level) => level > 0);
  const clamped = Object.fromEntries(
    Object.entries(known).map(([id, level]) => [id, clampLevel(level, max)]),
  );
  return { known: filterPositive(clamped), unknown };
}

function filterPositive(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).filter(([, level]) => level > 0));
}

function splitAnimalIds<T extends string>(
  record: Record<string, string[]>,
  knownIdsFor: (animalId: AnimalId) => KnownIds,
): { known: Partial<Record<AnimalId, Set<T>>>; unknown: Record<string, string[]> } {
  const known: Partial<Record<AnimalId, Set<T>>> = {};
  const unknown: Record<string, string[]> = {};
  for (const [animalId, ids] of Object.entries(record)) {
    if (!Object.hasOwn(trackerData.animals, animalId)) {
      unknown[animalId] = ids;
      continue;
    }
    const knownIds = knownIdsFor(animalId as AnimalId);
    const split = splitIds<T>(ids, (id) => hasKnownId(knownIds, id));
    known[animalId as AnimalId] = split.known;
    if (split.unknown.length > 0) unknown[animalId] = split.unknown;
  }
  return { known, unknown };
}

function normalizeBlob({
  lastImport,
  local,
  progress: stored,
  worldState,
}: ValidatedBlob): LoadedProgress {
  const retained = emptyRetainedProgress();

  const lists = {} as Record<ListField, Set<string>>;
  for (const field of LIST_FIELDS) {
    const isKnown =
      field === "almanac"
        ? (id: string) => trackerIndex.memberToCanonicalAlmanacId.has(id as ItemId)
        : (id: string) => hasKnownId(LIST_KNOWN_IDS[field], id);
    const split = splitIds(stored[field] ?? [], isKnown);
    lists[field] = split.known;
    if (split.unknown.length > 0) retained.lists[field] = split.unknown;
  }
  // A historical almanac ID that belongs to a merged entry is stored under its canonical ID.
  const almanac = new SvelteSet<ItemId>();
  for (const id of lists.almanac) {
    const canonical = trackerIndex.memberToCanonicalAlmanacId.get(id as ItemId);
    if (canonical) almanac.add(canonical);
  }

  const animals = splitAnimalIds<AnimalVariantId>(
    stored.animals,
    (animalId) => new Set(trackerData.animals[animalId].variantTiers.flatMap(recordKeys)),
  );
  retained.animals = animals.unknown;
  const animalCosmetics = splitAnimalIds<CosmeticId>(
    stored.animalCosmetics,
    (animalId) => trackerData.animals[animalId].cosmetics,
  );
  retained.animalCosmetics = animalCosmetics.unknown;

  const heartLevels = splitLevels(stored.heartLevels, trackerData.villagers, MAX_HEART_LEVEL);
  retained.heartLevels = heartLevels.unknown;
  const skillLevels = splitLevels(stored.skillLevels, trackerData.skills, MAX_SKILL_LEVEL);
  retained.skillLevels = skillLevels.unknown;
  const questStates = splitRecord(stored.questStates ?? {}, QUEST_IDS, (state) => state !== "none");
  retained.questStates = questStates.unknown;
  const relationships = splitRecord(
    stored.villagerRelationships ?? {},
    trackerData.villagers,
    (relationship) => relationship !== "undecided",
  );
  retained.villagerRelationships = relationships.unknown;
  const villagerRelationships = relationships.known as Partial<
    Record<VillagerId, VillagerRelationship>
  >;
  const history: ProgressHistory = {
    provenance: withCanonicalAlmanacKeys(stored.provenance ?? {}),
    // Parsed from JSON, so every saveValue is a JsonValue.
    resolutions: withCanonicalAlmanacKeys((stored.resolutions ?? {}) as ResolutionRecord),
  };
  if (stored.lastSavePlaytime !== undefined) history.lastSavePlaytime = stored.lastSavePlaytime;
  const beforeCascade = { ...villagerRelationships };
  applyEngagementCascade(villagerRelationships, stored.breakUpsDisabled ?? false);
  // A relationship changed by the engagement cascade is inferred.
  for (const [id, relationship] of recordEntries(villagerRelationships)) {
    if (beforeCascade[id] === relationship) continue;
    const { lastSavePlaytime: playtime } = history;
    history.provenance[factKey("villagerRelationships", id)] =
      playtime === undefined ? { source: "inferred" } : { playtime, source: "inferred" };
  }

  const progress: ProgressState = {
    almanac,
    almanacRecipes: lists.almanacRecipes as ProgressState["almanacRecipes"],
    animalCosmetics: animalCosmetics.known,
    animals: animals.known,
    breakUpsDisabled: stored.breakUpsDisabled ?? false,
    childChoice: stored.childChoice ?? "undeclared",
    cosmetics: lists.cosmetics as ProgressState["cosmetics"],
    hasUpperFloor: stored.hasUpperFloor ?? false,
    heartLevels: heartLevels.known,
    mineFloor: clampMineFloor(stored.mineFloor),
    mountAppearances: lists.mountAppearances as ProgressState["mountAppearances"],
    museum: lists.museum as ProgressState["museum"],
    petCosmetics: lists.petCosmetics as ProgressState["petCosmetics"],
    petSkins: lists.petSkins as ProgressState["petSkins"],
    questStates: questStates.known,
    reachedSeason: stored.reachedSeason ?? "spring",
    renown: clampRenownLevel(stored.renown),
    skillLevels: skillLevels.known,
    spells: lists.spells as ProgressState["spells"],
    unlockedPerks: lists.unlockedPerks as ProgressState["unlockedPerks"],
    villagerRelationships,
  };
  backfillAnimalMaps(progress);

  return {
    history,
    lastImport,
    local: local ?? {},
    progress,
    retained,
    worldState: { ...worldState },
  };
}

/**
 * Rekeys history for a historical almanac ID under its canonical entry, as hydration stores the
 * fact itself, since a later build may merge an ID with no storage migration. When several land on
 * one key, an entry already under the canonical key wins, then the first member in key order.
 */
function withCanonicalAlmanacKeys<V>(record: Readonly<Record<string, V>>): Record<string, V> {
  const rekeyed: Record<string, V> = {};
  const moved: [string, V][] = [];
  for (const [key, value] of Object.entries(record).toSorted(([a], [b]) =>
    a.localeCompare(b, "en"),
  )) {
    const id = key.startsWith("almanac/") ? key.slice("almanac/".length) : undefined;
    const canonical =
      id === undefined ? undefined : trackerIndex.memberToCanonicalAlmanacId.get(id as ItemId);
    if (canonical === undefined || canonical === id) rekeyed[key] = value;
    else moved.push([factKey("almanac", canonical), value]);
  }
  for (const [key, value] of moved) {
    if (!Object.hasOwn(rekeyed, key)) rekeyed[key] = value;
  }
  return rekeyed;
}

/**
 * Ensures every animal in trackerData has an entry in both the animals and animalCosmetics
 * records. Deserialized or merged state may predate newly added animals; this backfills empty sets
 * so downstream code can access maps without guarding missing keys.
 */
export function backfillAnimalMaps(progress: ProgressState): void {
  for (const animalId of recordKeys(trackerData.animals)) {
    progress.animals[animalId] ??= new SvelteSet<AnimalVariantId>();
    progress.animalCosmetics[animalId] ??= new SvelteSet<CosmeticId>();
  }
}

// ─── Writing ────────────────────────────────────────────────────────

function sortedUnion(known: Iterable<string>, retained: readonly string[] = []): string[] {
  return [...new Set([...known, ...retained])].toSorted();
}

/** Known entries that pass `keep`, then retained entries under keys the known side lacks. */
function mergeRecord<V>(
  known: Partial<Record<string, V>>,
  retained: Readonly<Record<string, V>>,
  keep: (value: V) => boolean,
): Record<string, V> {
  const merged: Record<string, V> = Object.fromEntries(
    recordEntries(known).filter(([, value]) => keep(value)),
  );
  for (const [id, value] of Object.entries(retained)) {
    if (!Object.hasOwn(known, id)) merged[id] = value;
  }
  return merged;
}

function mergeAnimalIds(
  known: DeepReadonly<Partial<Record<string, Set<string>>>>,
  retained: Readonly<Record<string, readonly string[]>>,
): Record<string, string[]> {
  const merged: Record<string, string[]> = Object.fromEntries(
    recordEntries(known).map(([animalId, ids]) => [animalId, sortedUnion(ids, retained[animalId])]),
  );
  for (const [animalId, ids] of Object.entries(retained)) {
    merged[animalId] ??= sortedUnion(ids);
  }
  return merged;
}

/**
 * Writes exactly the fields of {@link SerializedState}, plus the retained entries this build
 * couldn't place. Unrecognized fields in a loaded blob are dropped rather than carried forward, so
 * renamed keys don't linger.
 */
export function serializeProgress(snapshot: ProgressSnapshot): string {
  return JSON.stringify(serializedState(snapshot));
}

/** Everything a backup holds, as the store keeps it. */
export interface ProgressSnapshot {
  // Not DeepReadonly: its JsonValue resolutions are too deep for the compiler to map.
  history: Readonly<ProgressHistory>;
  /** The last manual import; absent writes `null`. */
  lastImport?: DeepReadonly<null | SaveImportMetadata>;
  progress: DeepReadonly<ProgressState>;
  retained: DeepReadonly<RetainedProgress>;
  worldState: Readonly<WorldState>;
}

/**
 * The stored form: the backup plus this device's `local` section, which only storage holds. An
 * empty section is left out, so storage stays byte-identical to a backup until sync fills it.
 */
export function serializeStoredProgress(
  snapshot: ProgressSnapshot,
  local: DeepReadonly<DeviceLocalState>,
): string {
  const backup = serializedState(snapshot);
  return JSON.stringify(Object.keys(local).length === 0 ? backup : { local, ...backup });
}

/** The outgoing farm's progress, kept in this device's `local` section when sync switches farms. */
export interface FarmSwitchBackup {
  /** A backup of the outgoing farm, restorable as is. It never holds a `local` section itself. */
  backup: SerializedState;
  farmName: null | string;
}

/**
 * The stored form of a farm switch: the new farm's progress, with the outgoing farm's backup in
 * this device's `local` section, so one write lands both or neither. The backup replaces any
 * earlier one rather than nesting it. `null` when the backup wouldn't restore, so the switch must
 * not happen.
 */
export function serializeFarmSwitch(
  next: ProgressSnapshot,
  outgoing: ProgressSnapshot,
  local: DeepReadonly<DeviceLocalState>,
): null | string {
  const backup = serializedState(outgoing);
  if (readProgressBlob(JSON.stringify(backup), "strict").kind !== "ok") return null;
  const farmSwitchBackup: FarmSwitchBackup = {
    backup,
    farmName: outgoing.lastImport?.farmName ?? null,
  };
  return serializeStoredProgress(next, { ...local, farmSwitchBackup });
}

/**
 * A stored blob as a backup: the same JSON without this device's `local` section. Used for a newer
 * build's blob this one can't otherwise read, so only the section's top-level key is touched.
 */
export function withoutDeviceLocal(json: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return json;
  }
  if (typeof parsed !== "object" || parsed === null || !("local" in parsed)) return json;
  const { local: _local, ...backup } = parsed;
  return JSON.stringify(backup);
}

function sortedRecord<V>(record: Readonly<Record<string, V>>): Record<string, V> {
  return Object.fromEntries(
    Object.entries(record).toSorted(([a], [b]) => a.localeCompare(b, "en")),
  );
}

function serializedState({
  history,
  lastImport,
  progress,
  retained,
  worldState,
}: ProgressSnapshot): SerializedState {
  const list = (field: ListField) => sortedUnion(progress[field], retained.lists[field]);
  const s: SerializedState = {
    lastImport: lastImport ?? null,
    progress: {
      ...(history.lastSavePlaytime === undefined
        ? {}
        : { lastSavePlaytime: history.lastSavePlaytime }),
      almanac: list("almanac"),
      almanacRecipes: list("almanacRecipes"),
      animalCosmetics: mergeAnimalIds(progress.animalCosmetics, retained.animalCosmetics),
      animals: mergeAnimalIds(progress.animals, retained.animals),
      breakUpsDisabled: progress.breakUpsDisabled,
      childChoice: progress.childChoice,
      cosmetics: list("cosmetics"),
      hasUpperFloor: progress.hasUpperFloor,
      heartLevels: mergeRecord(progress.heartLevels, retained.heartLevels, (level) => level > 0),
      mineFloor: progress.mineFloor,
      mountAppearances: list("mountAppearances"),
      museum: list("museum"),
      petCosmetics: list("petCosmetics"),
      petSkins: list("petSkins"),
      provenance: sortedRecord(history.provenance),
      questStates: mergeRecord(
        progress.questStates,
        retained.questStates,
        (state) => state !== "none",
      ),
      reachedSeason: progress.reachedSeason,
      renown: progress.renown,
      resolutions: sortedRecord(history.resolutions),
      skillLevels: mergeRecord(progress.skillLevels, retained.skillLevels, (level) => level > 0),
      spells: list("spells"),
      unlockedPerks: list("unlockedPerks"),
      villagerRelationships: mergeRecord(
        progress.villagerRelationships,
        retained.villagerRelationships,
        (relationship) => relationship !== "undecided",
      ),
    },
    version: CURRENT_SERIALIZATION_VERSION,
    worldState: { season: worldState.season, weather: worldState.weather },
  };
  return s;
}
