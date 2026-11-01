import { beforeEach, describe, expect, it } from "vitest";

import { trackerData, trackerIndex } from "#lib/data/index.js";
import { recordKeys } from "#lib/utils/record.js";

import { PREGNANCY_QUEST_IDS } from "./craving-quest.js";
import { editPlaytime, progressFacts } from "./provenance.js";
import {
  applySync,
  POLICY_TABLE,
  QUEST_KINDS_LISTED_AS_COMPLETED,
  receiptCovers,
  REMOVAL_HANDFUL,
} from "./sync-apply.js";

import type { FarmIdentity } from "#lib/types/save-identity.js";
import type { ProgressState } from "#lib/types/user-progress.js";

import type { ExtractedField, SaveExtraction, SaveFields } from "./import-save.js";
import type { FactProvenance } from "./provenance.js";
import type {
  SyncAnswer,
  SyncBundle,
  SyncOutcome,
  SyncQuestion,
  SyncResult,
  SyncState,
} from "./sync-apply.js";

// Plain strings stand in for the branded IDs throughout.
const ITEMS = trackerIndex.almanacCanonicalIds.slice(0, 12) as string[];
const [TURNIP, CARROT, POTATO] = ITEMS;
const VILLAGERS = recordKeys(trackerData.villagers).slice(0, 4) as string[];
const [BALOR, CELINE] = VILLAGERS;
const STORY_QUESTS = recordKeys(trackerData.quests.story).slice(0, 3) as string[];
const [STORY_QUEST] = STORY_QUESTS;
const [PREGNANCY_QUEST] = PREGNANCY_QUEST_IDS as ReadonlySet<string>;
const SPELLS = recordKeys(trackerData.mines.spells) as string[];

const FARM: FarmIdentity = {
  creationVersion: { major: 1, minor: 0, patch: 8, pre: null },
  saveNumber: "1315159680",
};
const OTHER_FARM: FarmIdentity = { ...FARM, saveNumber: "1720221376" };

function progress(overrides: Record<string, unknown> = {}): ProgressState {
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
    ...overrides,
  };
}

function syncState({
  farm = FARM,
  lastSavePlaytime,
  provenance = {},
  ...overrides
}: Record<string, unknown> & {
  farm?: FarmIdentity | null;
  lastSavePlaytime?: number;
  provenance?: Record<string, FactProvenance>;
} = {}): SyncState {
  return {
    farm,
    history: {
      ...(lastSavePlaytime === undefined ? {} : { lastSavePlaytime }),
      provenance,
      resolutions: {},
    },
    progress: progress(overrides),
  };
}

/** A new farm's start: nothing but a default unlock, as the store's default progress credits. */
const FRESH: SyncState = {
  farm: null,
  history: { provenance: { "spells/default": { source: "inferred" } }, resolutions: {} },
  progress: progress({ spells: new Set(["default"]) }),
};

function field<T>(value: T | undefined, completeness: "complete" | "unknown" = "complete") {
  return { completeness, diagnostics: [], untracked: [], value } satisfies ExtractedField<T>;
}

/** A save whose listed fields are complete; every other field is absent (unknown, no value). */
function bundle(
  fields: Record<string, unknown>,
  { farm = FARM, playtime }: { farm?: FarmIdentity; playtime?: number } = {},
): SyncBundle {
  const absent = field(undefined, "unknown");
  const all = Object.fromEntries(
    (Object.keys(progress()) as (keyof ProgressState)[]).map((key) => {
      const given = fields[key];
      if (given === undefined) return [key, absent];
      const isField = typeof given === "object" && given !== null && "completeness" in given;
      return [key, isField ? given : field(given)];
    }),
  ) as unknown as SaveFields;
  const extraction: SaveExtraction = {
    diagnostics: [],
    fields: all,
    identity: { creationVersion: field(undefined, "unknown"), playtime: field(playtime) },
  };
  return { extraction, farm };
}

function applied(outcome: SyncOutcome): SyncResult {
  if (outcome.kind !== "applied") throw new Error(`Expected a result, got ${outcome.kind}`);
  return outcome.result;
}

function asked(outcome: SyncOutcome): SyncQuestion[] {
  if (outcome.kind !== "ask") throw new Error("Expected questions");
  return outcome.questions;
}

/** Answers every question as `answer` asks, stage by stage, until the bundle applies. */
function settle(
  state: SyncState,
  incoming: SyncBundle,
  answer: (question: SyncQuestion) => SyncAnswer,
): SyncResult {
  const answers: Record<string, SyncAnswer> = {};
  for (let stage = 0; stage < 4; stage++) {
    const outcome = applySync(state, incoming, { answers, fresh: FRESH });
    if (outcome.kind === "applied") return outcome.result;
    for (const question of outcome.questions) answers[question.id] = answer(question);
  }
  throw new Error("Questions never settled");
}

const set = (...ids: string[]) => new Set(ids);
const policies = (result: SyncResult) =>
  Object.fromEntries(result.differences.map(({ key, policy }) => [key, policy]));

describe("applySync: the policy table", () => {
  it("applies an addition silently & stamps it with the save's playtime", () => {
    const result = applied(
      applySync(syncState(), bundle({ almanac: set(TURNIP) }, { playtime: 100 }), {
        fresh: FRESH,
      }),
    );
    expect(policies(result)).toEqual({ [`almanac/${TURNIP}`]: "apply-silently" });
    expect(result.state.progress.almanac).toEqual(set(TURNIP));
    expect(result.state.history.provenance[`almanac/${TURNIP}`]).toEqual({
      playtime: 100,
      source: "save",
    });
    expect(result.state.history.lastSavePlaytime).toBe(100);
  });

  it("applies & tells when a complete field removes a fact a save or inference set", () => {
    const state = syncState({
      almanac: set(TURNIP, CARROT),
      lastSavePlaytime: 50,
      provenance: {
        [`almanac/${CARROT}`]: { playtime: 50, source: "inferred" },
        [`almanac/${TURNIP}`]: { playtime: 50, source: "save" },
      },
    });
    const result = applied(
      applySync(state, bundle({ almanac: set() }, { playtime: 100 }), { fresh: FRESH }),
    );
    expect(policies(result)).toEqual({
      [`almanac/${CARROT}`]: "apply-and-tell",
      [`almanac/${TURNIP}`]: "apply-and-tell",
    });
    expect(result.state.progress.almanac).toEqual(set());
  });

  it("lets an unknown field add but never remove or lower anything", () => {
    const state = syncState({
      almanac: set(TURNIP),
      heartLevels: { [BALOR]: 6 },
      provenance: {
        [`almanac/${TURNIP}`]: { playtime: 50, source: "save" },
        [`heartLevels/${BALOR}`]: { playtime: 50, source: "save" },
      },
    });
    const result = applied(
      applySync(
        state,
        bundle(
          {
            almanac: field(set(CARROT), "unknown"),
            heartLevels: field({ [BALOR]: 2, [CELINE]: 3 }, "unknown"),
          },
          { playtime: 100 },
        ),
        { fresh: FRESH },
      ),
    );
    expect(policies(result)).toEqual({
      [`almanac/${CARROT}`]: "apply-silently",
      [`heartLevels/${CELINE}`]: "apply-silently",
    });
    expect(result.state.progress.almanac).toEqual(set(TURNIP, CARROT));
    expect(result.state.progress.heartLevels).toEqual({ [BALOR]: 6, [CELINE]: 3 });
  });

  it("never replaces anything with an absent field", () => {
    const state = syncState({ almanac: set(TURNIP), mineFloor: 20 });
    const result = applied(applySync(state, bundle({}, { playtime: 100 }), { fresh: FRESH }));
    expect(result.differences).toEqual([]);
    expect(result.state.progress).toEqual(state.progress);
  });

  it("asks before lowering a level, whatever the table says", () => {
    const state = syncState({
      heartLevels: { [BALOR]: 5 },
      lastSavePlaytime: 100,
      mineFloor: 30,
      provenance: {
        [`heartLevels/${BALOR}`]: { playtime: 90, source: "save" },
        mineFloor: { playtime: 100, source: "manual" },
      },
    });
    const questions = asked(
      applySync(state, bundle({ heartLevels: {}, mineFloor: 20 }, { playtime: 130 }), {
        fresh: FRESH,
      }),
    );
    expect(questions.map((question) => question.kind === "facts" && question.reason)).toEqual([
      "level-decrease",
      "level-decrease",
    ]);
  });

  it("keeps a manual level that beats an older-or-equal save without asking", () => {
    const state = syncState({
      lastSavePlaytime: 100,
      mineFloor: 30,
      provenance: { mineFloor: { playtime: 100, source: "manual" } },
    });
    const result = applied(
      applySync(state, bundle({ mineFloor: 20 }, { playtime: 100 }), { fresh: FRESH }),
    );
    expect(policies(result)).toEqual({ mineFloor: "keep-local-and-tell" });
    expect(result.state.progress.mineFloor).toBe(30);
  });

  it(`asks before more than ${REMOVAL_HANDFUL} removals in one bundle`, () => {
    const removals = (count: number) => {
      const ids = ITEMS.slice(0, count);
      return syncState({
        almanac: set(...ids),
        provenance: Object.fromEntries(
          ids.map((id) => [`almanac/${id}`, { playtime: 50, source: "save" }]),
        ),
      });
    };
    const handful = applied(
      applySync(removals(REMOVAL_HANDFUL), bundle({ almanac: set() }, { playtime: 100 }), {
        fresh: FRESH,
      }),
    );
    expect(new Set(Object.values(policies(handful)))).toEqual(set("apply-and-tell"));

    const [question, ...rest] = asked(
      applySync(removals(REMOVAL_HANDFUL + 1), bundle({ almanac: set() }, { playtime: 100 }), {
        fresh: FRESH,
      }),
    );
    expect(rest).toEqual([]);
    expect(question).toMatchObject({ field: "almanac", kind: "facts", reason: "many-removals" });
    expect(question.kind === "facts" && question.differences).toHaveLength(REMOVAL_HANDFUL + 1);
  });

  it("covers every provenance & kind, and every quest kind", () => {
    expect(Object.keys(POLICY_TABLE).toSorted()).toEqual([
      "inferred",
      "manual",
      "none",
      "save",
      "unknown",
    ]);
    expect(Object.keys(QUEST_KINDS_LISTED_AS_COMPLETED).toSorted()).toEqual(
      Object.keys(trackerData.quests).toSorted(),
    );
  });
});

const unticked = (stamp?: number) =>
  syncState({
    lastSavePlaytime: 100,
    provenance: {
      [`almanac/${TURNIP}`]:
        stamp === undefined ? { source: "manual" } : { playtime: stamp, source: "manual" },
    },
  });

describe("applySync: manual edits & playtime ordering", () => {
  it("keeps an untick against a save with the same or lower playtime, & tells", () => {
    const result = applied(
      applySync(unticked(100), bundle({ almanac: set(TURNIP) }, { playtime: 100 }), {
        fresh: FRESH,
      }),
    );
    expect(policies(result)).toEqual({ [`almanac/${TURNIP}`]: "keep-local-and-tell" });
    expect(result.state.progress.almanac).toEqual(set());
    expect(result.state.history.provenance[`almanac/${TURNIP}`]).toEqual({
      playtime: 100,
      source: "manual",
    });
  });

  it("lets a newer save win over an untick, & tells", () => {
    const result = applied(
      applySync(unticked(100), bundle({ almanac: set(TURNIP) }, { playtime: 130 }), {
        fresh: FRESH,
      }),
    );
    expect(policies(result)).toEqual({ [`almanac/${TURNIP}`]: "apply-and-tell" });
    expect(result.state.progress.almanac).toEqual(set(TURNIP));
  });

  it("asks when a manual edit or the save has no playtime to order by", () => {
    for (const [state, playtime] of [
      [unticked(), 130],
      [unticked(100), undefined],
    ] as const) {
      const [question] = asked(
        applySync(state, bundle({ almanac: set(TURNIP) }, { playtime }), { fresh: FRESH }),
      );
      expect(question).toMatchObject({ kind: "facts", reason: "local-disagrees" });
    }
  });

  it("asks about an edit made after a save whose playtime couldn't be read", () => {
    const ordered = applied(
      applySync(syncState(), bundle({ almanac: set() }, { playtime: 100 }), { fresh: FRESH }),
    );
    const unordered = applied(
      applySync(ordered.state, bundle({ almanac: set() }), { fresh: FRESH }),
    ).state;
    expect(unordered.history).toMatchObject({ lastSavePlaytime: 100, lastSaveUnordered: true });

    // The player ticks the turnip by hand, stamped as the store's edits are.
    const playtime = editPlaytime(unordered.history);
    expect(playtime).toBeUndefined();
    unordered.progress.almanac.add(TURNIP as never);
    unordered.history.provenance[`almanac/${TURNIP}`] = { source: "manual" };

    const [question] = asked(
      applySync(unordered, bundle({ almanac: set() }, { playtime: 110 }), { fresh: FRESH }),
    );
    expect(question).toMatchObject({ kind: "facts", reason: "local-disagrees" });
    const later = settle(unordered, bundle({ almanac: set() }, { playtime: 110 }), () => "keep");
    expect(later.state.history).not.toHaveProperty("lastSaveUnordered");
    expect(editPlaytime(later.state.history)).toBe(110);
  });
});

const legacy = () =>
  syncState({
    almanac: set(TURNIP, CARROT, POTATO),
    provenance: {
      [`almanac/${CARROT}`]: { source: "unknown" },
      [`almanac/${POTATO}`]: { source: "unknown" },
      [`almanac/${TURNIP}`]: { source: "unknown" },
    },
  });

describe("applySync: a quest's two moments", () => {
  const key = `questStates/${STORY_QUEST}`;
  const applyQuest = (state: SyncState, questState: string) =>
    applied(
      applySync(state, bundle({ questStates: { [STORY_QUEST]: questState } }, { playtime: 100 }), {
        fresh: FRESH,
      }),
    ).state.history.provenance[key];

  it("keeps a manual obtained moment when a save finishes a quest", () => {
    const state = syncState({
      provenance: { [key]: { playtime: 50, source: "manual" } },
      questStates: { [STORY_QUEST]: "obtained" },
    });

    expect(applyQuest(state, "completed")).toEqual({
      obtainedSource: "manual",
      playtime: 100,
      source: "save",
    });
  });

  it("replaces an inferred obtained moment when a save finishes a quest", () => {
    const state = syncState({
      provenance: { [key]: { source: "inferred" } },
      questStates: { [STORY_QUEST]: "obtained" },
    });

    expect(applyQuest(state, "completed")).toEqual({ playtime: 100, source: "save" });
  });

  it("replaces the obtained moment of a quest with no record when a save finishes it", () => {
    const state = syncState({ questStates: { [STORY_QUEST]: "obtained" } });

    expect(applyQuest(state, "completed")).toEqual({ playtime: 100, source: "save" });
  });

  it("records none when a save finishes the quest a save obtained", () => {
    const state = syncState({
      provenance: { [key]: { playtime: 50, source: "save" } },
      questStates: { [STORY_QUEST]: "obtained" },
    });

    expect(applyQuest(state, "completed")).toEqual({ playtime: 100, source: "save" });
  });

  it("leaves a manual finish alone when a save agrees, mixed mark included", () => {
    const record: FactProvenance = { obtainedSource: "save", playtime: 50, source: "manual" };
    const state = syncState({
      provenance: { [key]: record },
      questStates: { [STORY_QUEST]: "completed" },
    });

    expect(applyQuest(state, "completed")).toEqual(record);
  });

  it("leaves a pen slash under a stamped X when a save agrees", () => {
    const record: FactProvenance = { obtainedSource: "manual", playtime: 50, source: "save" };
    const state = syncState({
      provenance: { [key]: record },
      questStates: { [STORY_QUEST]: "completed" },
    });

    expect(applyQuest(state, "completed")).toEqual(record);
  });

  it("keeps a manual obtained moment when promoting an agreeing unknown fact", () => {
    const state = syncState({
      provenance: { [key]: { obtainedSource: "manual", source: "unknown" } },
      questStates: { [STORY_QUEST]: "completed" },
    });

    expect(applyQuest(state, "completed")).toEqual({
      obtainedSource: "manual",
      playtime: 100,
      source: "save",
    });
  });

  it("replaces a guessed obtained moment when a save agrees with the finish", () => {
    const state = syncState({
      provenance: { [key]: { obtainedSource: "unknown", playtime: 50, source: "save" } },
      questStates: { [STORY_QUEST]: "completed" },
    });

    expect(applyQuest(state, "completed")).toEqual({ playtime: 50, source: "save" });
  });

  it("stamps a guessed obtained moment under a manual finish when a save agrees", () => {
    const state = syncState({
      provenance: { [key]: { obtainedSource: "inferred", playtime: 50, source: "manual" } },
      questStates: { [STORY_QUEST]: "completed" },
    });

    expect(applyQuest(state, "completed")).toEqual({
      obtainedSource: "save",
      playtime: 50,
      source: "manual",
    });
  });
});

describe("applySync: inferred facts", () => {
  it("promotes an agreeing inferred fact to a save fact", () => {
    const state = syncState({
      almanac: set(TURNIP),
      provenance: { [`almanac/${TURNIP}`]: { playtime: 5, source: "inferred" } },
    });
    const result = applied(
      applySync(state, bundle({ almanac: set(TURNIP) }, { playtime: 100 }), { fresh: FRESH }),
    );
    expect(result.state.history.provenance).toEqual({
      [`almanac/${TURNIP}`]: { playtime: 100, source: "save" },
    });
  });
});

describe("applySync: facts from before provenance", () => {
  it("promotes agreeing facts to save facts & lets the save add", () => {
    const state = syncState({
      almanac: set(TURNIP),
      provenance: { [`almanac/${TURNIP}`]: { source: "unknown" } },
    });
    const result = applied(
      applySync(state, bundle({ almanac: set(TURNIP, CARROT) }, { playtime: 100 }), {
        fresh: FRESH,
      }),
    );
    expect(result.state.history.provenance).toEqual({
      [`almanac/${CARROT}`]: { playtime: 100, source: "save" },
      [`almanac/${TURNIP}`]: { playtime: 100, source: "save" },
    });
  });

  it("asks once per category when the save disagrees", () => {
    const questions = asked(
      applySync(legacy(), bundle({ almanac: set(), spells: set(SPELLS[0]) }, { playtime: 100 }), {
        fresh: FRESH,
      }),
    );
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      field: "almanac",
      kind: "facts",
      reason: "local-disagrees",
    });
    expect(questions[0].kind === "facts" && questions[0].differences).toHaveLength(3);
  });

  it("remembers “keep mine” until the save's value changes", () => {
    const incoming = bundle({ almanac: set(CARROT) }, { playtime: 100 });
    const kept = settle(legacy(), incoming, () => "keep");
    expect(kept.state.progress.almanac).toEqual(set(TURNIP, CARROT, POTATO));
    expect(kept.state.history.resolutions).toEqual({
      [`almanac/${POTATO}`]: { saveValue: null },
      [`almanac/${TURNIP}`]: { saveValue: null },
    });

    const again = applied(
      applySync(kept.state, bundle({ almanac: set(CARROT) }, { playtime: 130 }), { fresh: FRESH }),
    );
    expect(again.differences).toEqual([]);

    // Ticked again in the save: the “keep mine” no longer applies, and agreement settles it.
    const changed = applied(
      applySync(kept.state, bundle({ almanac: set(TURNIP, CARROT) }, { playtime: 160 }), {
        fresh: FRESH,
      }),
    );
    expect(changed.state.history.resolutions).toEqual({
      [`almanac/${POTATO}`]: { saveValue: null },
    });
  });

  it("asks before replacing an existing level or quest, but adds one at its default", () => {
    const state = syncState({
      mineFloor: 20,
      provenance: {
        [`questStates/${STORY_QUEST}`]: { source: "unknown" },
        mineFloor: { source: "unknown" },
      },
      questStates: { [STORY_QUEST]: "obtained" },
    });
    const questions = asked(
      applySync(
        state,
        bundle(
          { mineFloor: 30, questStates: { [STORY_QUEST]: "completed" }, renown: 12 },
          { playtime: 100 },
        ),
        { fresh: FRESH },
      ),
    );
    expect(
      questions.map((question) => question.kind === "facts" && [question.field, question.reason]),
    ).toEqual([
      ["mineFloor", "local-disagrees"],
      ["questStates", "local-disagrees"],
    ]);

    const kept = settle(
      state,
      bundle({ mineFloor: 30, renown: 12 }, { playtime: 100 }),
      () => "keep",
    );
    expect(kept.state.progress.mineFloor).toBe(20);
    expect(policies(kept)).toMatchObject({ renown: "apply-silently" });
  });

  it("takes the save's values when the player accepts", () => {
    const result = settle(
      legacy(),
      bundle({ almanac: set(CARROT) }, { playtime: 100 }),
      () => "accept",
    );
    expect(result.state.progress.almanac).toEqual(set(CARROT));
    expect(result.state.history.provenance[`almanac/${TURNIP}`]).toEqual({
      playtime: 100,
      source: "save",
    });
  });

  it("asks again where a question's effect changed while it waited", () => {
    const incoming = bundle({ almanac: set() }, { playtime: 100 });
    const [question] = asked(applySync(legacy(), incoming, { fresh: FRESH }));
    const edited = legacy();
    (edited.progress.almanac as Set<string>).delete(POTATO);
    const outcome = applySync(edited, incoming, {
      answers: { [question.id]: "accept" },
      fresh: FRESH,
    });
    const [reasked] = asked(outcome);
    expect(reasked.id).not.toBe(question.id);
    expect(reasked.kind === "facts" && reasked.differences).toHaveLength(2);
  });
});

describe("applySync: resolutions", () => {
  it("lapses “keep mine” once the save reports the default, so a later change asks again", () => {
    const state = syncState({
      lastSavePlaytime: 100,
      provenance: { hasUpperFloor: { source: "manual" } },
    });
    const kept = settle(state, bundle({ hasUpperFloor: true }, { playtime: 130 }), () => "keep");
    expect(kept.state.history.resolutions).toEqual({ hasUpperFloor: { saveValue: "1" } });

    const lapsed = applied(
      applySync(kept.state, bundle({ hasUpperFloor: false }, { playtime: 160 }), { fresh: FRESH }),
    );
    expect(lapsed.state.history.resolutions).toEqual({});

    const [question] = asked(
      applySync(lapsed.state, bundle({ hasUpperFloor: true }, { playtime: 190 }), {
        fresh: FRESH,
      }),
    );
    expect(question).toMatchObject({ field: "hasUpperFloor", kind: "facts" });
  });

  it("keeps “keep mine” when the field couldn't be read in full", () => {
    const state = syncState({ provenance: { [`almanac/${TURNIP}`]: { source: "manual" } } });
    const kept = settle(state, bundle({ almanac: set(TURNIP) }, { playtime: 100 }), () => "keep");
    const partial = applied(
      applySync(kept.state, bundle({ almanac: field(set(), "unknown") }, { playtime: 130 }), {
        fresh: FRESH,
      }),
    );
    expect(partial.state.history.resolutions).toEqual(kept.state.history.resolutions);
  });
});

describe("applySync: quests & household facts", () => {
  it("replaces quest states for kinds the game lists as completed", () => {
    const state = syncState({
      provenance: { [`questStates/${STORY_QUEST}`]: { playtime: 50, source: "save" } },
      questStates: { [STORY_QUEST]: "completed" },
    });
    const result = applied(
      applySync(state, bundle({ questStates: {} }, { playtime: 100 }), { fresh: FRESH }),
    );
    expect(policies(result)).toEqual({ [`questStates/${STORY_QUEST}`]: "apply-and-tell" });
    expect(result.state.progress.questStates).toEqual({ [STORY_QUEST]: "none" });
  });

  it("compares household facts and pregnancy quests through the policy table", () => {
    const state = syncState({
      breakUpsDisabled: true,
      childChoice: "yes",
      questStates: { [PREGNANCY_QUEST]: "completed" },
      villagerRelationships: { [BALOR]: "married" },
    });
    const result = settle(
      state,
      bundle(
        {
          breakUpsDisabled: field(false, "complete"),
          questStates: {},
          villagerRelationships: field({ [CELINE]: "romantic" }, "complete"),
        },
        { playtime: 100 },
      ),
      () => "accept",
    );
    expect(result.state.progress.breakUpsDisabled).toBe(false);
    expect(result.state.progress.villagerRelationships).toMatchObject({ [CELINE]: "romantic" });
    expect(result.state.progress.questStates[PREGNANCY_QUEST as never]).toBe("none");
    expect(result.state.progress.childChoice).toBe("yes");
  });

  it("settles a spouse change and its child evidence as one household question", () => {
    const state = syncState({
      childChoice: "no",
      provenance: { childChoice: { source: "unknown" } },
      villagerRelationships: { [BALOR]: "married" },
    });
    const incoming = bundle({
      breakUpsDisabled: true,
      childChoice: "yes",
      villagerRelationships: { [CELINE]: "married" },
    });
    const questions = asked(applySync(state, incoming, { fresh: FRESH }));
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      field: "household",
      kind: "facts",
      reason: "local-disagrees",
    });
    expect(settle(state, incoming, () => "keep").state.progress).toEqual(state.progress);
    const result = settle(state, incoming, () => "accept");
    expect(result.state.progress.villagerRelationships).toEqual({
      [CELINE]: "married",
    });
    expect(result.state.progress.childChoice).toBe("yes");
  });

  it("does not construct a second spouse from partial relationship evidence", () => {
    const state = syncState({ villagerRelationships: { [BALOR]: "married" } });
    const incoming = bundle({
      childChoice: "yes",
      villagerRelationships: field({ [CELINE]: "married" }, "unknown"),
    });
    const result = settle(state, incoming, () => "accept");
    expect(result.state.progress.villagerRelationships).toEqual(
      state.progress.villagerRelationships,
    );
    expect(result.state.progress.childChoice).toBe("undeclared");
  });

  it("reopens the whole kept household when one dependent save value changes", () => {
    const state = syncState({
      childChoice: "no",
      provenance: { childChoice: { source: "manual" } },
      villagerRelationships: { [BALOR]: "married" },
    });
    const incoming = bundle({
      childChoice: "yes",
      villagerRelationships: { [CELINE]: "proposed" },
    });
    const first = settle(state, incoming, () => "keep");
    expect(applySync(first.state, incoming, { fresh: FRESH }).kind).toBe("applied");
    const changed = bundle({ childChoice: "yes", villagerRelationships: { [CELINE]: "married" } });
    const result = settle(first.state, changed, () => "accept");
    expect(result.state.progress.villagerRelationships).toEqual({
      [CELINE]: "married",
    });
    expect(result.state.progress.childChoice).toBe("yes");
    expect(result.state.history.resolutions).toEqual({});
  });

  it("reopens the kept household when one dependent save value changes back to local", () => {
    const state = syncState({
      provenance: { breakUpsDisabled: { source: "manual" }, childChoice: { source: "manual" } },
    });
    const first = settle(
      state,
      bundle({ breakUpsDisabled: true, childChoice: "yes" }, { playtime: 100 }),
      () => "keep",
    );
    expect(Object.keys(first.state.history.resolutions)).toEqual(
      expect.arrayContaining(["breakUpsDisabled", "childChoice"]),
    );
    const [question] = asked(
      applySync(
        first.state,
        bundle({ breakUpsDisabled: false, childChoice: "yes" }, { playtime: 130 }),
        {
          fresh: FRESH,
        },
      ),
    );
    expect(question).toMatchObject({ field: "household", kind: "facts" });
  });

  it("preserves an unordered manual household when any dependent fact would be kept", () => {
    const state = syncState({
      childChoice: "no",
      lastSavePlaytime: 100,
      provenance: { [`villagerRelationships/${BALOR}`]: { playtime: 100, source: "manual" } },
      villagerRelationships: { [BALOR]: "married" },
    });
    const result = settle(
      state,
      bundle(
        { childChoice: "yes", villagerRelationships: { [CELINE]: "married" } },
        { playtime: 100 },
      ),
      () => "accept",
    );
    expect(result.state.progress).toEqual(state.progress);
  });

  it("forgets a kept break-ups disagreement after an explicit return to the default", () => {
    const state = syncState();
    state.history.provenance.breakUpsDisabled = { source: "manual" };
    const first = settle(state, bundle({ breakUpsDisabled: true }), () => "keep");
    expect(first.state.history.resolutions.breakUpsDisabled).toEqual({ saveValue: "1" });
    const reset = settle(first.state, bundle({ breakUpsDisabled: false }), () => "keep");
    expect(reset.state.history.resolutions).toEqual({});
    expect(applySync(reset.state, bundle({ breakUpsDisabled: true }), { fresh: FRESH }).kind).toBe(
      "ask",
    );
  });
});

describe("applySync: rolling back to an older save", () => {
  const played = () =>
    syncState({
      almanac: set(TURNIP, CARROT),
      lastSavePlaytime: 200,
      mineFloor: 30,
      provenance: {
        [`almanac/${CARROT}`]: { playtime: 180, source: "manual" },
        [`almanac/${TURNIP}`]: { playtime: 200, source: "save" },
        mineFloor: { playtime: 200, source: "save" },
      },
    });
  const older = bundle({ almanac: set(), mineFloor: 30 }, { playtime: 150 });

  it("asks first, and changes nothing when the player keeps their progress", () => {
    const [question] = asked(applySync(played(), older, { fresh: FRESH }));
    expect(question).toMatchObject({ kind: "older-save", lastPlaytime: 200, playtime: 150 });
    const result = settle(played(), older, () => "keep");
    expect(result.rollback).toBe("declined");
    expect(result.state).toEqual(played());
  });

  it("rolls back on accepting, keeps later edits, & re-stamps them to the save", () => {
    const result = settle(played(), older, () => "accept");
    expect(result.rollback).toBe("accepted");
    expect(policies(result)).toEqual({
      [`almanac/${CARROT}`]: "keep-local-and-tell",
      [`almanac/${TURNIP}`]: "apply-and-tell",
    });
    expect(result.state.progress.almanac).toEqual(set(CARROT));
    expect(result.state.history.lastSavePlaytime).toBe(150);
    expect(result.state.history.provenance[`almanac/${CARROT}`]).toEqual({
      playtime: 150,
      source: "manual",
    });

    // The next save that disagrees wins.
    const next = applied(
      applySync(result.state, bundle({ almanac: set() }, { playtime: 160 }), { fresh: FRESH }),
    );
    expect(policies(next)).toEqual({ [`almanac/${CARROT}`]: "apply-and-tell" });
  });
});

describe("applySync: renamed game IDs", () => {
  it("never removes a fact when the save lists an ID it doesn't recognize", () => {
    const state = syncState({
      almanac: set(TURNIP),
      provenance: { [`almanac/${TURNIP}`]: { playtime: 50, source: "save" } },
    });
    const renamed: ExtractedField<Set<string>> = {
      completeness: "unknown",
      diagnostics: [{ code: "unknown-id", id: `${TURNIP}_v2`, path: "player.items_acquired" }],
      untracked: [],
      value: set(),
    };
    const result = applied(
      applySync(state, bundle({ almanac: renamed }, { playtime: 100 }), {
        fresh: FRESH,
      }),
    );
    expect(result.differences).toEqual([]);
    expect(result.state.progress.almanac).toEqual(set(TURNIP));
    expect(result.unknownIds).toEqual({ almanac: [`${TURNIP}_v2`] });
  });

  it("asks when a rename leaves a complete field missing many facts", () => {
    const state = syncState({
      almanac: set(...ITEMS),
      provenance: Object.fromEntries(
        ITEMS.map((id) => [`almanac/${id}`, { playtime: 50, source: "save" }]),
      ),
    });
    const [question] = asked(
      applySync(state, bundle({ almanac: set(TURNIP) }, { playtime: 100 }), { fresh: FRESH }),
    );
    expect(question).toMatchObject({ kind: "facts", reason: "many-removals" });
  });
});

const tracked = () => syncState({ almanac: set(TURNIP), farm: null });

describe("applySync: farm identity", () => {
  it("asks once whether unidentified progress is this farm", () => {
    const incoming = bundle({ almanac: set(TURNIP, CARROT) }, { playtime: 100 });
    const questions = asked(applySync(tracked(), incoming, { fresh: FRESH }));
    expect(questions).toEqual([{ id: `farm:${FARM.saveNumber}`, kind: "farm" }]);

    const same = settle(tracked(), incoming, () => "same-farm");
    expect(same.farmSwitch).toBeUndefined();
    expect(same.state.farm).toEqual(FARM);
    expect(same.state.progress.almanac).toEqual(set(TURNIP, CARROT));
    // Identified now, so the next bundle doesn't ask.
    expect(applySync(same.state, incoming, { fresh: FRESH }).kind).toBe("applied");
  });

  it("adopts the farm without asking when nothing was tracked yet", () => {
    const untouched = { ...structuredClone(FRESH), farm: null };
    const result = applied(
      applySync(untouched, bundle({ almanac: set(TURNIP) }, { playtime: 100 }), { fresh: FRESH }),
    );
    expect(result.farmSwitch).toBeUndefined();
    expect(result.state.farm).toEqual(FARM);
  });

  it("switches farms with a backup of the outgoing one when the player says it's new", () => {
    const result = settle(
      tracked(),
      bundle({ almanac: set(CARROT) }, { playtime: 100 }),
      () => "new-farm",
    );
    expect(result.farmSwitch).toEqual({ backup: tracked() });
    expect(result.state.farm).toEqual(FARM);
    expect(result.state.progress.almanac).toEqual(set(CARROT));
    expect(result.state.progress.spells).toEqual(set("default"));
  });

  it("switches automatically from an identified farm to another, starting fresh", () => {
    const state = syncState({
      almanac: set(TURNIP),
      lastSavePlaytime: 5000,
      provenance: { [`almanac/${TURNIP}`]: { playtime: 4000, source: "manual" } },
    });
    const result = applied(
      applySync(state, bundle({ almanac: set(CARROT) }, { farm: OTHER_FARM, playtime: 100 }), {
        fresh: FRESH,
      }),
    );
    expect(result.farmSwitch).toEqual({ backup: state });
    expect(result.rollback).toBeUndefined();
    expect(result.state.farm).toEqual(OTHER_FARM);
    expect(result.state.progress.almanac).toEqual(set(CARROT));
    expect(result.state.history.lastSavePlaytime).toBe(100);
    expect(result.state.history.provenance[`almanac/${TURNIP}`]).toBeUndefined();
  });

  it("keeps a stored game number a renamed save file couldn't supply", () => {
    const result = settle(
      syncState({ almanac: set(TURNIP) }),
      bundle({}, { farm: { creationVersion: null, saveNumber: null }, playtime: 100 }),
      () => "same-farm",
    );
    expect(result.state.farm).toEqual(FARM);
  });
});

// A fixed seed makes failures reproducible while varying every input independently.
const SEED = 129;
let seed: number;
function random(): number {
  seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
  return seed / 2 ** 32;
}
const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
const some = (values: readonly string[], density = 0.5) =>
  set(...values.filter(() => random() < density));
const levels = () =>
  Object.fromEntries(
    VILLAGERS.filter(() => random() < 0.6).map((id) => [id, 1 + pick([0, 2, 4, 6])]),
  );
const quests = () =>
  Object.fromEntries(
    [...STORY_QUESTS, PREGNANCY_QUEST]
      .filter(() => random() < 0.6)
      .map((id) => [id, pick(["completed", "obtained"])]),
  );
const sources = ["inferred", "manual", "save", "unknown"] as const;

function randomState(): SyncState {
  const state = syncState({
    almanac: some(ITEMS, pick([0.2, 0.9])),
    childChoice: pick(["no", "undeclared", "yes"]),
    heartLevels: levels(),
    lastSavePlaytime: pick([undefined, 100, 200]),
    mineFloor: pick([0, 10, 40]),
    questStates: quests(),
    villagerRelationships: random() < 0.5 ? { [BALOR]: "married" } : {},
  });
  for (const key of progressFacts(state.progress).keys()) {
    const source = pick(sources);
    const playtime = source === "unknown" ? undefined : pick([undefined, 100, 150, 250]);
    state.history.provenance[key] = playtime === undefined ? { source } : { playtime, source };
  }
  return state;
}

function randomBundle(): SyncBundle {
  const completeness = () => pick(["complete", "unknown"] as const);
  return bundle(
    {
      almanac: field(some(ITEMS, pick([0.1, 0.5])), completeness()),
      breakUpsDisabled: field(pick([true, false]), completeness()),
      childChoice: field(pick(["undeclared", "yes"]), completeness()),
      heartLevels: field(levels(), completeness()),
      mineFloor: field(pick([1, 10, 40]), completeness()),
      questStates: field(quests(), completeness()),
      villagerRelationships: field(
        { [CELINE]: pick(["romantic", "platonic", "married"]) },
        completeness(),
      ),
    },
    { playtime: pick([undefined, 120, 180, 300]) },
  );
}

const SAMPLES = 200;
const LEVEL_KEY = /^(heartLevels|mineFloor)/;
const fitting = (question: SyncQuestion): SyncAnswer =>
  question.kind === "farm" ? pick(["same-farm", "new-farm"]) : pick(["accept", "keep"]);
const QUEST_RANK: Record<string, number> = { completed: 2, obtained: 1 };
const order = (value: string) => QUEST_RANK[value] ?? Number(value);
/** Stored facts the result removed or lowered; raising a level or a quest isn't a loss. */
const lowered = (before: SyncState, after: SyncState) => {
  const facts = progressFacts(after.progress);
  return [...progressFacts(before.progress)].filter(([key, value]) => {
    const now = facts.get(key);
    return now === undefined || order(now) < order(value);
  });
};

describe("applySync: properties", () => {
  beforeEach(() => {
    seed = SEED;
  });

  it("never modifies its inputs", () => {
    for (let sample = 0; sample < SAMPLES; sample++) {
      const [state, incoming] = [randomState(), randomBundle()];
      const [stateCopy, freshCopy] = [structuredClone(state), structuredClone(FRESH)];
      settle(state, incoming, fitting);
      expect(state).toEqual(stateCopy);
      expect(FRESH).toEqual(freshCopy);
    }
  });

  it("never removes or lowers facts from unknown fields", () => {
    for (let sample = 0; sample < SAMPLES; sample++) {
      const state = randomState();
      const incoming = randomBundle();
      for (const extracted of Object.values(incoming.extraction.fields)) {
        extracted.completeness = "unknown";
      }
      const result = settle(state, incoming, () => "accept");
      expect(lowered(state, result.state)).toEqual([]);
    }
  });

  it("without the player's yes, never lowers a level or removes more than a handful", () => {
    const reasons = new Set<string>();
    for (let sample = 0; sample < SAMPLES; sample++) {
      const state = randomState();
      const result = settle(state, randomBundle(), () => "keep");
      const lost = lowered(state, result.state);
      expect(lost.filter(([key]) => LEVEL_KEY.test(key))).toEqual([]);
      expect(lost.length).toBeLessThanOrEqual(REMOVAL_HANDFUL);
      for (const { reason } of result.differences) if (reason) reasons.add(reason);
    }
    // The generated inputs reach every guardrail, so the property isn't vacuous.
    expect(reasons).toEqual(new Set(["level-decrease", "local-disagrees", "many-removals"]));
  });

  it("settles: applying the same save again changes nothing", () => {
    for (let sample = 0; sample < SAMPLES; sample++) {
      const incoming = randomBundle();
      const first = settle(randomState(), incoming, fitting);
      const second = settle(first.state, incoming, () => "keep");
      expect(second.differences.filter(({ applied: written }) => written)).toEqual([]);
      expect(second.state.progress).toEqual(first.state.progress);
    }
  });

  it("never constructs competing partners or romances forbidden by the break-ups setting", () => {
    let changed = 0;
    for (let sample = 0; sample < SAMPLES; sample++) {
      const state = randomState();
      const result = settle(state, randomBundle(), fitting);
      const relationships = Object.values(result.state.progress.villagerRelationships);
      const partners = relationships.filter((value) => value === "proposed" || value === "married");
      expect(partners.length).toBeLessThanOrEqual(1);
      const forbiddenRomance =
        !result.state.progress.breakUpsDisabled &&
        partners.length > 0 &&
        relationships.includes("romantic");
      expect(forbiddenRomance).toBe(false);
      changed += Number(
        result.differences.some(
          (difference) => difference.applied && difference.field === "villagerRelationships",
        ),
      );
    }
    expect(changed).toBeGreaterThan(0);
  });
});

describe("receiptCovers", () => {
  const receipt = { counter: 5, hash: "h5", mailboxId: "box" };

  it("applies everything before the first receipt", () => {
    expect(receiptCovers(undefined, receipt)).toBe(false);
    expect(receiptCovers(undefined, { hash: "h5" })).toBe(false);
  });

  it("skips an envelope from the same mailbox whose counter isn't higher", () => {
    expect(receiptCovers(receipt, receipt)).toBe(true);
    expect(receiptCovers(receipt, { counter: 4, hash: "h4", mailboxId: "box" })).toBe(true);
    expect(receiptCovers(receipt, { counter: 6, hash: "h6", mailboxId: "box" })).toBe(false);
  });

  it("applies a higher counter even when the save is unchanged", () => {
    expect(receiptCovers(receipt, { counter: 6, hash: "h5", mailboxId: "box" })).toBe(false);
  });

  it("always applies a new code's envelopes, whatever their counter", () => {
    expect(receiptCovers(receipt, { counter: 1, hash: "h5", mailboxId: "new" })).toBe(false);
  });

  it("skips the computer's own saves by hash", () => {
    expect(receiptCovers({ hash: "same" }, { hash: "same" })).toBe(true);
    expect(receiptCovers({ hash: "same" }, { hash: "other" })).toBe(false);
  });

  it("doesn't skip an envelope on a receipt the computer wrote", () => {
    expect(receiptCovers({ hash: "h" }, { counter: 1, hash: "h", mailboxId: "box" })).toBe(false);
  });
});
