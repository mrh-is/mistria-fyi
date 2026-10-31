/**
 * Applying a synced save: given stored progress & an extracted save, how each difference between
 * them is settled, and the state that results. Pure: the receiver (`#lib/sync/receiver.js`) asks the
 * questions, & the store computes & writes the result in one write. See `docs/sync.md` § Applying a
 * bundle.
 *
 * Each difference gets one {@link SyncPolicy} from {@link POLICY_TABLE}, keyed by the stored fact's
 * provenance & the kind of fact, then the guardrails: a level decrease, or more than
 * {@link REMOVAL_HANDFUL} removals in one bundle, asks first whatever the table says. Questions are
 * answered by calling {@link applySync} again with the answers; anything a question would change is
 * written only once every question is answered.
 */
import { trackerData } from "#lib/data/index.js";
import { PREGNANCY_QUEST_IDS } from "#lib/engine/craving-quest.js";
import { questStateRank, seasonOrdinal } from "#lib/engine/domain-primitives.js";
import { getOrCreate, recordEntries, recordKeys } from "#lib/utils/record.js";

import {
  confirmedBySave,
  holdsGuess,
  obtainedSourceOf,
  progressFacts,
  resolutionHolds,
} from "./provenance.js";
import { compareFarms } from "./save-identity.js";

import type { FarmIdentity } from "#lib/types/save-identity.js";
import type { QuestId, QuestType, Season, VillagerRelationship } from "#lib/types/tracker-data.js";
import type { ChildChoice, ProgressState, QuestState } from "#lib/types/user-progress.js";

import type { ExtractedProgressKey, SaveExtraction } from "./import-save.js";
import type { FactProvenance, ProgressHistory, ProvenanceSource } from "./provenance.js";

// ─── Inputs & outputs ───────────────────────────────────────────────

/** What sync reads & writes. Plain data: pass a snapshot, never the store's reactive state. */
export interface SyncState {
  /** The farm the progress belongs to, or `null` when it was never identified. */
  farm: FarmIdentity | null;
  history: ProgressHistory;
  progress: ProgressState;
}

/** One save to apply: its extraction & the farm it identifies (see `readSaveIdentity`). */
export interface SyncBundle {
  extraction: SaveExtraction;
  farm: FarmIdentity;
}

/**
 * How one difference is settled. The two “tell” policies are reported to the player afterwards;
 * `ask-first` waits for an answer before anything it covers changes.
 */
export type SyncPolicy = "apply-and-tell" | "apply-silently" | "ask-first" | "keep-local-and-tell";

/** A fact's shape: ticked or not, an ordered level (a season counts), or a quest's state. */
export type FactKind = "level" | "quest" | "tick";

/** `forward` when the save holds more progress than stored: a tick, a higher level, a later state. */
export type SyncDirection = "backward" | "forward";

/**
 * Why a difference asks first:
 *
 * - `local-disagrees`: the stored fact can't be ordered against the save: it predates provenance
 *   (`unknown`), or it's a manual edit made before any save with a readable playtime was applied.
 * - `level-decrease`: the save would lower a level.
 * - `many-removals`: the bundle would remove more than a handful of facts, as a renamed game ID
 *   might.
 */
export type AskReason = "level-decrease" | "local-disagrees" | "many-removals";

/** The fields sync compares. */
export type SyncField = ExtractedProgressKey;

/** One fact on which stored progress & the save disagree. Values are `progressFacts` values. */
export interface SyncDifference {
  /** Whether the save's value was written. */
  applied: boolean;
  direction: SyncDirection;
  field: SyncField;
  key: string;
  kind: FactKind;
  /** The stored value; `undefined` at the default (unticked, zero, `none`). */
  local: string | undefined;
  policy: SyncPolicy;
  /** The stored fact's provenance; `undefined` for a fact with no history. */
  provenance: ProvenanceSource | undefined;
  /** Why it asked first, when it did. */
  reason?: AskReason;
  /** The save's value; `undefined` when the save says it's at the default. */
  save: string | undefined;
}

/**
 * A question for the player. Its `id` names exactly what it would change, so a question whose
 * effect changes while it waits (progress edited meanwhile) gets a new `id` & is asked again.
 *
 * - `farm`: stored progress was never identified; is this the farm being tracked? Answer
 *   `same-farm` or `new-farm`.
 * - `older-save`: the save has less playtime than the last one applied (a manual save was loaded).
 *   Answer `accept` to roll back to it, or `keep`.
 * - `facts`: one field's differences for one {@link AskReason}, or the dependent household's
 *   differences with `field: "household"` & its strongest reason (`many-removals` takes precedence
 *   over `local-disagrees`). Answer `accept` to take the save's values, or `keep` to keep stored
 *   ones until the save reports something else.
 */
export type SyncQuestion =
  | FactsQuestion
  | { id: string; kind: "farm" }
  | { id: string; kind: "older-save"; lastPlaytime: number; playtime: number };

export interface FactsQuestion {
  differences: SyncDifference[];
  /** `household` covers dependent facts across fields; each difference keeps its actual field. */
  field: "household" | SyncField;
  id: string;
  kind: "facts";
  reason: AskReason;
}

export type SyncAnswer = "accept" | "keep" | "new-farm" | "same-farm";
/** Answers keyed by {@link SyncQuestion} `id`. An answer that doesn't fit its question is ignored. */
export type SyncAnswers = Readonly<Record<string, SyncAnswer>>;

export interface SyncResult {
  /** Every difference & how it was settled, for the notices & the sync log. */
  differences: SyncDifference[];
  /**
   * Set when the save is another farm's: the outgoing farm's state, to keep as the one farm-switch
   * backup in the same write as `state`. If the backup can't be written, nothing is.
   */
  farmSwitch?: { backup: SyncState };
  /** How an older save was settled, when the save was older than the last one applied. */
  rollback?: "accepted" | "declined";
  state: SyncState;
  /** Unrecognized IDs the save listed, by field, for the sync log. */
  unknownIds: Partial<Record<ExtractedProgressKey, string[]>>;
}

export type SyncOutcome =
  | { kind: "applied"; result: SyncResult }
  | { kind: "ask"; questions: SyncQuestion[] };

export interface SyncOptions {
  answers?: SyncAnswers;
  /** A new farm's starting state (default progress, empty history), used on a farm switch. */
  fresh: SyncState;
}

// ─── The receipt ────────────────────────────────────────────────────

/**
 * What this device last applied: the save's hash &, when it came through a code, the mailbox &
 * counter of its envelope. A computer's own applies have only the hash.
 */
export interface SyncReceipt {
  counter?: number;
  hash: string;
  mailboxId?: string;
}

/**
 * Whether the receipt already covers a save, so it's skipped. An envelope is covered only when its
 * mailbox matches & its counter isn't higher, so a new code's envelopes always apply; the computer's
 * own applies, which have no envelope, are covered by the save's hash.
 */
export function receiptCovers(
  receipt: Readonly<SyncReceipt> | undefined,
  incoming: Readonly<SyncReceipt>,
): boolean {
  if (receipt === undefined) return false;
  if (incoming.mailboxId === undefined || incoming.counter === undefined) {
    return receipt.hash === incoming.hash;
  }
  return (
    receipt.mailboxId === incoming.mailboxId &&
    receipt.counter !== undefined &&
    incoming.counter <= receipt.counter
  );
}

// ─── Policy ─────────────────────────────────────────────────────────

/**
 * `add-if-default` applies silently when the stored fact is at its default, so the save only adds,
 * and asks when it would replace a different value whose ordering is unknown.
 *
 * `by-playtime` is settled by ordering on `playtime`: a manual edit records the last applied save's playtime and
 * beats any save with that playtime or lower (`keep-local-and-tell`), while a newer save wins
 * (`apply-and-tell`). An edit or save without a readable playtime can't be ordered, so it asks.
 */
type PolicyRule = "add-if-default" | "by-playtime" | SyncPolicy;
type PolicyRow = Record<FactKind, Record<SyncDirection, PolicyRule>>;

const SAVE_AUTHORITY: PolicyRow = {
  level: { backward: "ask-first", forward: "apply-silently" },
  quest: { backward: "apply-and-tell", forward: "apply-silently" },
  tick: { backward: "apply-and-tell", forward: "apply-silently" },
};

/**
 * The policy for each difference, by the stored fact's provenance (`none` for a fact with no
 * history) & kind, before the guardrails. A save or inference is superseded by the save. A manual
 * edit is ordered by playtime. A fact from before provenance existed (`unknown`) is treated like a
 * manual one that can't be ordered: the save may add a fact still at its default, but replacing or
 * removing a value asks.
 */
export const POLICY_TABLE: Readonly<Record<"none" | ProvenanceSource, PolicyRow>> = {
  inferred: SAVE_AUTHORITY,
  manual: {
    level: { backward: "by-playtime", forward: "by-playtime" },
    quest: { backward: "by-playtime", forward: "by-playtime" },
    tick: { backward: "by-playtime", forward: "by-playtime" },
  },
  none: SAVE_AUTHORITY,
  save: SAVE_AUTHORITY,
  unknown: {
    level: { backward: "ask-first", forward: "add-if-default" },
    quest: { backward: "ask-first", forward: "add-if-default" },
    tick: { backward: "ask-first", forward: "add-if-default" },
  },
};

/** “More than a handful” of removals in one bundle asks first. */
export const REMOVAL_HANDFUL = 5;

/**
 * Quest kinds whose states a complete save may lower, because the game lists every completion. In
 * v1.0.8 `QuestLog.complete` is the only way into `completed_quests` & the only way out of
 * `active_quests` for every kind the tracker follows, & a late-game save's
 * `quest_<id>_complete` facts match its list for every kind. Rank quests older saves passed before
 * they existed are recovered from renown at extraction. Mark a kind `false` if a game update
 * records its completions elsewhere: its quests then only ever advance.
 */
export const QUEST_KINDS_LISTED_AS_COMPLETED: Readonly<Record<QuestType, boolean>> = {
  cooking: true,
  crown: true,
  fetch: true,
  heart: true,
  mission: true,
  story: true,
};

const QUEST_KIND = new Map<string, QuestType>(
  recordKeys(trackerData.quests).flatMap((kind) =>
    recordKeys(trackerData.quests[kind]).map((id): [string, QuestType] => [id, kind]),
  ),
);

/**
 * These facts describe one household; a decision must keep or apply its dependent changes together.
 */
function isHouseholdFact(field: SyncField, id: string | undefined): boolean {
  return (
    field === "villagerRelationships" ||
    field === "breakUpsDisabled" ||
    field === "childChoice" ||
    (field === "questStates" && PREGNANCY_QUEST_IDS.has(id as QuestId))
  );
}

const LEVEL_FIELDS: ReadonlySet<SyncField> = new Set<SyncField>([
  "heartLevels",
  "mineFloor",
  "reachedSeason",
  "renown",
  "skillLevels",
]);

const SYNC_FIELDS: readonly SyncField[] = [
  "almanac",
  "almanacRecipes",
  "animalCosmetics",
  "animals",
  "breakUpsDisabled",
  "childChoice",
  "cosmetics",
  "hasUpperFloor",
  "heartLevels",
  "mineFloor",
  "mountAppearances",
  "museum",
  "petCosmetics",
  "petSkins",
  "questStates",
  "reachedSeason",
  "renown",
  "skillLevels",
  "spells",
  "unlockedPerks",
  "villagerRelationships",
];

function factKind(field: SyncField): FactKind {
  if (field === "questStates") return "quest";
  return LEVEL_FIELDS.has(field) ? "level" : "tick";
}

/** A fact value's place in its field's order; `undefined` is the default. */
function rank(field: SyncField, value: string | undefined): number {
  if (field === "villagerRelationships") {
    if (value === "married") return 3;
    if (value === "proposed") return 2;
    return value === undefined ? 0 : 1;
  }
  if (field === "questStates") return questStateRank((value ?? "none") as QuestState);
  if (field === "reachedSeason") return seasonOrdinal((value ?? "spring") as Season);
  return LEVEL_FIELDS.has(field) ? Number(value ?? 0) : Number(value !== undefined);
}

// ─── Applying ───────────────────────────────────────────────────────

/**
 * Settles every difference between `state` & the save, or returns the questions still unanswered.
 * Questions come in stages, since each answer changes what follows: whether this is the tracked
 * farm, then whether to roll back to an older save, then every field's questions at once.
 * `state` & `options.fresh` are never modified.
 */
export function applySync(
  state: SyncState,
  bundle: SyncBundle,
  { answers = {}, fresh }: SyncOptions,
): SyncOutcome {
  const unknownIds = unknownSaveIds(bundle.extraction);
  let farmSwitch: SyncResult["farmSwitch"];
  let base = cloneState(state);

  const match = compareFarms(state.farm, bundle.farm);
  if (match === "unidentified" && tracksProgress(state, fresh)) {
    const question = { id: `farm:${farmLabel(bundle.farm)}`, kind: "farm" } as const;
    const answer = answers[question.id];
    if (answer !== "same-farm" && answer !== "new-farm") {
      return { kind: "ask", questions: [question] };
    }
    if (answer === "new-farm") farmSwitch = { backup: cloneState(state) };
  } else if (match === "different") {
    farmSwitch = { backup: cloneState(state) };
  }
  if (farmSwitch) base = cloneState(fresh);
  base.farm = mergeFarm(farmSwitch ? null : state.farm, bundle.farm);

  const playtime = bundle.extraction.identity.playtime.value;
  const lastPlaytime = base.history.lastSavePlaytime;
  let rollback: SyncResult["rollback"];
  if (playtime !== undefined && lastPlaytime !== undefined && playtime < lastPlaytime) {
    const question = {
      id: `older-save:${farmLabel(bundle.farm)}:${playtime}:${lastPlaytime}`,
      kind: "older-save",
      lastPlaytime,
      playtime,
    } as const;
    const answer = answers[question.id];
    if (answer !== "accept" && answer !== "keep") return { kind: "ask", questions: [question] };
    if (answer === "keep") {
      return {
        kind: "applied",
        result: { differences: [], rollback: "declined", state: base, unknownIds },
      };
    }
    rollback = "accepted";
  }

  const { differences, promotions, settled } = compare(base, bundle.extraction);
  const questions = factQuestions(differences);
  const unanswered = questions.filter(({ id }) => {
    const answer = answers[id];
    return answer !== "accept" && answer !== "keep";
  });
  if (unanswered.length > 0) return { kind: "ask", questions: unanswered };

  const accepted = new Set(
    questions.flatMap((question) =>
      answers[question.id] === "accept" ? question.differences.map(({ key }) => key) : [],
    ),
  );
  const stamp: FactProvenance =
    playtime === undefined ? { source: "save" } : { playtime, source: "save" };
  const { history, progress } = base;
  for (const key of settled) history.resolutions = withoutKey(history.resolutions, key);
  for (const key of promotions) {
    history.provenance[key] = confirmedBySave(history.provenance[key], playtime);
  }
  for (const difference of differences) {
    const { key, policy, save } = difference;
    difference.applied =
      policy === "apply-silently" ||
      policy === "apply-and-tell" ||
      (policy === "ask-first" && accepted.has(key));
    if (difference.applied) {
      writeFact(progress, key, save);
      const obtainedSource = obtainedSourceOf(
        ownEntry(history.provenance, key),
        "save",
        difference.local,
        save,
      );
      history.provenance[key] = obtainedSource ? { ...stamp, obtainedSource } : { ...stamp };
      history.resolutions = withoutKey(history.resolutions, key);
    } else if (policy === "ask-first") {
      history.resolutions[key] = { saveValue: save ?? null };
    }
  }
  if (playtime !== undefined) {
    history.lastSavePlaytime = playtime;
    // Edits stamped after the save rolled back to keep beating it (they survived it), but the next
    // save that disagrees with them wins.
    if (rollback === "accepted") {
      for (const record of Object.values(history.provenance)) {
        if (record.source === "manual" && record.playtime !== undefined) {
          record.playtime = Math.min(record.playtime, playtime);
        }
      }
    }
  }

  return {
    kind: "applied",
    result: {
      differences,
      ...(farmSwitch ? { farmSwitch } : {}),
      ...(rollback ? { rollback } : {}),
      state: base,
      unknownIds,
    },
  };
}

interface Comparison {
  differences: SyncDifference[];
  /** Facts the save agrees with whose records hold a guess, which the save replaces. */
  promotions: string[];
  /** Facts whose “keep mine” lapsed: the save now reports another value, or agrees. */
  settled: string[];
}

function compare(base: SyncState, extraction: SaveExtraction): Comparison {
  const { history, progress } = base;
  const playtime = extraction.identity.playtime.value;
  const local = progressFacts(progress);
  const resolved = Object.keys(history.resolutions);
  const comparison: Comparison = { differences: [], promotions: [], settled: [] };

  for (const field of SYNC_FIELDS) {
    const extracted = extraction.fields[field];
    if (extracted.value === undefined) continue;
    const save = progressFacts({ ...emptyProgress(), [field]: extracted.value });
    const complete = extracted.completeness === "complete";
    // A complete field speaks for every fact it holds; an unknown one only for what it lists.
    // A complete field also settles “keep mine” for facts at their default on both sides.
    const keys = new Set([
      ...save.keys(),
      ...(complete
        ? [
            ...fieldKeys(local.keys(), field),
            ...fieldKeys(resolved, field),
            ...fieldKeys(Object.keys(history.provenance), field),
          ]
        : []),
    ]);
    for (const key of keys) {
      const [, id] = key.split("/");
      const [localValue, saveValue] = [local.get(key), save.get(key)];
      const resolution = ownEntry(history.resolutions, key);
      const provenance = ownEntry(history.provenance, key);
      if (localValue === saveValue) {
        if (provenance && holdsGuess(provenance)) comparison.promotions.push(key);
        if (resolution) comparison.settled.push(key);
        continue;
      }
      const direction = rank(field, saveValue) > rank(field, localValue) ? "forward" : "backward";
      // Only a complete field removes or lowers, and only quests the game reliably lists.
      if (direction === "backward" && (!complete || !questReplaceable(field, id))) continue;
      if (!isHouseholdFact(field, id) && resolutionHolds(resolution, saveValue ?? null)) continue;
      if (resolution) comparison.settled.push(key);

      const kind = factKind(field);
      const rule = POLICY_TABLE[provenance?.source ?? "none"][kind][direction];
      let policy = settleRule(rule, localValue, provenance?.playtime, playtime);
      // Guardrail: whatever the table says, a level is never lowered without asking.
      const decrease = kind === "level" && direction === "backward";
      if (decrease && policy !== "keep-local-and-tell") policy = "ask-first";
      let reason: AskReason | undefined;
      if (policy === "ask-first") reason = decrease ? "level-decrease" : "local-disagrees";
      comparison.differences.push({
        applied: false,
        direction,
        field,
        key,
        kind,
        local: localValue,
        policy,
        provenance: provenance?.source,
        ...(reason ? { reason } : {}),
        save: saveValue,
      });
    }
  }

  const removals = comparison.differences.filter(
    ({ direction, policy }) =>
      direction === "backward" && (policy === "apply-silently" || policy === "apply-and-tell"),
  );
  // Guardrail: a bundle removing more than a handful of facts asks, in case a game ID was renamed.
  if (removals.length > REMOVAL_HANDFUL) {
    for (const removal of removals) {
      removal.policy = "ask-first";
      removal.reason = "many-removals";
    }
  }
  const household = comparison.differences.filter(({ field, key }) =>
    isHouseholdFact(field, key.split("/")[1]),
  );
  if (
    household.length > 0 &&
    household.every(({ key, save }) =>
      resolutionHolds(ownEntry(history.resolutions, key), save ?? null),
    )
  ) {
    comparison.differences = comparison.differences.filter(
      (difference) => !household.includes(difference),
    );
    comparison.settled = comparison.settled.filter(
      (key) => !household.some((difference) => difference.key === key),
    );
  }
  settleHousehold(base, comparison.differences);
  return comparison;
}

/** Preserve the strictest dependent decision; never synthesize cascades over manual facts. */
function settleHousehold(base: SyncState, differences: SyncDifference[]): void {
  const household = differences.filter(({ field, key }) =>
    isHouseholdFact(field, key.split("/")[1]),
  );
  if (household.length === 0) return;
  const candidate = structuredClone(base.progress);
  for (const difference of household) writeFact(candidate, difference.key, difference.save);
  const relationships = Object.values(candidate.villagerRelationships);
  const partners = relationships.filter((value) => value === "married" || value === "proposed");
  const inconsistent =
    partners.length > 1 ||
    (!candidate.breakUpsDisabled && partners.length > 0 && relationships.includes("romantic"));
  const keep = inconsistent || household.some(({ policy }) => policy === "keep-local-and-tell");
  const ask = household.some(({ policy }) => policy === "ask-first");
  if (!keep && !ask) return;
  const reason = household.some((difference) => difference.reason === "many-removals")
    ? "many-removals"
    : "local-disagrees";
  for (const difference of household) {
    difference.policy = keep ? "keep-local-and-tell" : "ask-first";
    if (keep) {
      delete difference.reason;
    } else {
      difference.reason = reason;
    }
  }
}

function settleRule(
  rule: PolicyRule,
  local: string | undefined,
  edited: number | undefined,
  playtime: number | undefined,
): SyncPolicy {
  if (rule === "add-if-default") return local === undefined ? "apply-silently" : "ask-first";
  return rule === "by-playtime" ? byPlaytime(edited, playtime) : rule;
}

function byPlaytime(edited: number | undefined, playtime: number | undefined): SyncPolicy {
  if (edited === undefined || playtime === undefined) return "ask-first";
  return playtime > edited ? "apply-and-tell" : "keep-local-and-tell";
}

function questReplaceable(field: SyncField, id: string | undefined): boolean {
  if (field !== "questStates") return true;
  const kind = id === undefined ? undefined : QUEST_KIND.get(id);
  return kind !== undefined && QUEST_KINDS_LISTED_AS_COMPLETED[kind];
}

/** One question per field & reason; the dependent household has its own field identity. */
function factQuestions(differences: readonly SyncDifference[]): FactsQuestion[] {
  const groups = new Map<string, SyncDifference[]>();
  for (const difference of differences) {
    if (difference.policy !== "ask-first" || !difference.reason) continue;
    const household = isHouseholdFact(difference.field, difference.key.split("/")[1]);
    const group = `${household ? "household" : difference.field}:${difference.reason}`;
    groups.set(group, [...(groups.get(group) ?? []), difference]);
  }
  return [...groups].map(([group, grouped]) => ({
    differences: grouped,
    field: isHouseholdFact(grouped[0].field, grouped[0].key.split("/")[1])
      ? "household"
      : grouped[0].field,
    id: `facts:${group}:${grouped
      .map(({ key, local, save }) => `${key}=${local ?? ""}>${save ?? ""}`)
      .toSorted()
      .join(",")}`,
    kind: "facts",
    reason: grouped[0].reason ?? "local-disagrees",
  }));
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Whether `state` holds anything beyond a new farm's starting progress. */
function tracksProgress(state: SyncState, fresh: SyncState): boolean {
  const [tracked, start] = [progressFacts(state.progress), progressFacts(fresh.progress)];
  return (
    tracked.size !== start.size || [...tracked].some(([key, value]) => start.get(key) !== value)
  );
}

/** The incoming identity, keeping any part only the stored one could read. */
function mergeFarm(tracked: FarmIdentity | null, incoming: FarmIdentity): FarmIdentity {
  return {
    creationVersion: incoming.creationVersion ?? tracked?.creationVersion ?? null,
    saveNumber: incoming.saveNumber ?? tracked?.saveNumber ?? null,
  };
}

function farmLabel({ saveNumber }: FarmIdentity): string {
  return saveNumber ?? "unknown";
}

function fieldKeys(keys: Iterable<string>, field: SyncField): string[] {
  return [...keys].filter((key) => key === field || key.startsWith(`${field}/`));
}

function unknownSaveIds(extraction: SaveExtraction): SyncResult["unknownIds"] {
  const unknownIds: SyncResult["unknownIds"] = {};
  for (const [field, extracted] of recordEntries(extraction.fields)) {
    const ids = extracted.diagnostics.flatMap((diagnostic) =>
      diagnostic.code === "unknown-id" ? [diagnostic.id] : [],
    );
    if (ids.length > 0) unknownIds[field] = [...new Set(ids)];
  }
  return unknownIds;
}

function cloneState(state: SyncState): SyncState {
  return structuredClone(state);
}

function emptyProgress(): ProgressState {
  return {
    almanac: new Set(),
    almanacRecipes: new Set(),
    animalCosmetics: {},
    animals: {},
    breakUpsDisabled: false,
    childChoice: "undeclared",
    cosmetics: new Set(),
    hasUpperFloor: false,
    heartLevels: {},
    mineFloor: 0,
    mountAppearances: new Set(),
    museum: new Set(),
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    spells: new Set(),
    unlockedPerks: new Set(),
    villagerRelationships: {},
  };
}

/** Sets one fact to a `progressFacts` value, or to its default for `undefined`. */
function writeFact(progress: ProgressState, key: string, value: string | undefined): void {
  const [field, id = "", member = ""] = key.split("/") as [SyncField, string?, string?];
  switch (field) {
    case "animalCosmetics":
    case "animals": {
      const byAnimal = progress[field] as Record<string, Set<string>>;
      const ids = getOrCreate(byAnimal, id, () => new Set<string>());
      if (value === undefined) ids.delete(member);
      else ids.add(member);
      return;
    }
    case "hasUpperFloor":
      progress.hasUpperFloor = value !== undefined;
      return;
    case "breakUpsDisabled":
      progress.breakUpsDisabled = value !== undefined;
      return;
    case "childChoice":
      progress.childChoice = (value ?? "undeclared") as ChildChoice;
      return;
    case "villagerRelationships":
      if (value === undefined) {
        progress.villagerRelationships = withoutKey(progress.villagerRelationships, id);
      } else {
        (progress.villagerRelationships as Record<string, VillagerRelationship>)[id] =
          value as VillagerRelationship;
      }
      return;
    case "heartLevels":
    case "skillLevels":
      (progress[field] as Record<string, number>)[id] = Number(value ?? 0);
      return;
    case "questStates":
      (progress.questStates as Record<string, QuestState>)[id] = (value ?? "none") as QuestState;
      return;
    case "mineFloor":
    case "renown":
      progress[field] = Number(value ?? 0);
      return;
    case "reachedSeason":
      progress.reachedSeason = (value ?? "spring") as Season;
      return;
    case "almanac":
    case "almanacRecipes":
    case "cosmetics":
    case "mountAppearances":
    case "museum":
    case "petCosmetics":
    case "petSkins":
    case "spells":
    case "unlockedPerks": {
      const ids = progress[field] as Set<string>;
      if (value === undefined) ids.delete(id);
      else ids.add(id);
    }
  }
}

function ownEntry<V>(record: Readonly<Record<string, V>>, key: string): undefined | V {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

function withoutKey<V>(record: Readonly<Record<string, V>>, key: string): Record<string, V> {
  const { [key]: _removed, ...kept } = record;
  return kept;
}
