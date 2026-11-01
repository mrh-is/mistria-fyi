import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { recordEntries, recordValues } from "#lib/utils/record.js";

import { extractSave, extractSaveProgress } from "./import-save.js";
import { SAVE_OBSERVATIONS } from "./import-save.observations.js";
import { parseSavArchive } from "./parse-sav.js";
import { readSaveIdentity } from "./save-identity.js";
import { applySync } from "./sync-apply.js";

import type { VillagerId } from "#lib/types/tracker-data.js";

import type { SaveBundle, SaveExtraction } from "./import-save.js";
import type { GameObservation } from "./import-save.observations.js";
import type { SyncState } from "./sync-apply.js";

// Real saves for the committed tracker data's game version, read locally & never committed.
const INPUT_DIR = fileURLToPath(new URL("../../../pipeline/input", import.meta.url));
const SAVE_DIR = path.join(INPUT_DIR, `v${trackerData.version}`, "save");
const SAVE_FILES = readdirSync(SAVE_DIR).filter((name) => name.endsWith(".sav"));
/** Fields a save never fully determines (see `PARTIAL_FIELDS` in `import-save.ts`). */
const PARTIAL_KEYS = new Set(["childChoice"]);

async function readSave(name: string, version = trackerData.version): Promise<SaveBundle> {
  const file = path.join(INPUT_DIR, `v${version}`, "save", name);
  return parseSavArchive(new File([readFileSync(file)], name));
}

function confirmedValue<T>(observation: GameObservation<T>): T {
  if (observation.status !== "confirmed") throw new Error("Game observation is still pending");
  expect(observation.source.observer.trim()).not.toBe("");
  expect(observation.source.observedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(observation.source.evidence.trim()).not.toBe("");
  return observation.value;
}

describe.each(SAVE_OBSERVATIONS)(
  "independent game observations: v$gameVersion/$file",
  (fixture) => {
    let bundle: SaveBundle;
    beforeAll(async () => {
      bundle = await readSave(fixture.file, fixture.gameVersion);
    });

    it("matches the exact private snapshot & writing game version", () => {
      const file = path.join(INPUT_DIR, `v${fixture.gameVersion}`, "save", fixture.file);
      expect(createHash("sha256").update(readFileSync(file)).digest("hex")).toBe(fixture.sha256);
      const [major, minor, patch] = fixture.gameVersion.split(".").map(Number);
      expect(bundle.info?.version).toMatchObject({ major, minor, patch });
    });

    it.skipIf(fixture.mineFloor.status === "pending")(
      "matches the player’s confirmed mine floor",
      () => {
        const observed = confirmedValue(fixture.mineFloor);
        const { mineFloor } = extractSave(bundle).fields;
        expect(mineFloor.completeness).toBe("complete");
        expect(mineFloor.value).toBe(observed);
      },
    );

    it.skipIf(fixture.museum.status === "pending")(
      "matches the player’s confirmed museum donations",
      () => {
        const { donated, notDonated } = confirmedValue(fixture.museum);
        expect(donated.length + notDonated.length).toBeGreaterThan(0);
        const knownItems = new Set<string>(
          recordValues(trackerData.museum).flatMap(({ sets }) =>
            recordValues(sets).flatMap(({ items }) => items),
          ),
        );
        for (const id of [...donated, ...notDonated]) expect(knownItems).toContain(id);
        const { museum } = extractSave(bundle).fields;
        expect(museum.completeness).toBe("complete");
        for (const id of donated) expect(museum.value).toContain(id);
        for (const id of notDonated) expect(museum.value).not.toContain(id);
      },
    );

    it.skipIf(fixture.spouse.status === "pending")("matches the player’s confirmed spouse", () => {
      const observed = confirmedValue(fixture.spouse);
      const { villagerRelationships } = extractSave(bundle).fields;
      expect(villagerRelationships.completeness).toBe("complete");
      const spouses = Object.entries(villagerRelationships.value ?? {})
        .filter(([, status]) => status === "married")
        .map(([id]) => id);
      expect(spouses).toEqual(observed === null ? [] : [observed]);
    });
  },
);

/** A deep copy of `bundle` with `edit` applied, so each case starts from the real save. */
function mutated(bundle: SaveBundle, edit: (copy: SaveBundle) => void): SaveBundle {
  const copy = structuredClone(bundle);
  edit(copy);
  return copy;
}

function unrecognized(extraction: SaveExtraction): unknown[] {
  return extraction.diagnostics.filter((diagnostic) => diagnostic.code === "unknown-id");
}

describe.each(SAVE_FILES)("real save %s", (name) => {
  let bundle: SaveBundle;
  beforeAll(async () => {
    bundle = await readSave(name);
  });

  it("reads the native farm number and creation version without using display names as identity", () => {
    expect(readSaveIdentity(bundle).identity).toEqual({
      creationVersion: bundle.info?.creation_version,
      saveNumber: /^game-(\d+)-/.exec(name)?.[1],
    });
  });

  it("holds no unrecognized IDs, so every field it fully records is complete", () => {
    const extraction = extractSave(bundle);

    expect(unrecognized(extraction)).toEqual([]);
    for (const [key, field] of Object.entries(extraction.fields)) {
      const expected = PARTIAL_KEYS.has(key) ? "unknown" : "complete";
      expect(field.completeness, `${key}: ${JSON.stringify(field.diagnostics)}`).toBe(expected);
    }
  });

  it("reads the actual household statuses, break-ups setting, and Mistmare fact", () => {
    const { fields } = extractSave(bundle);
    const late = name === "game-1315159680-autosave.sav";
    expect(bundle.player?.disable_break_ups).toBe(late);
    expect(fields.breakUpsDisabled).toMatchObject({ completeness: "complete", value: late });
    const facts = bundle.gamedata?.t2_world_facts as Record<string, unknown>;
    expect(facts.cutscene_seen_reveal_mistmare).toBe(late ? 1 : 0);
    expect(fields.mountAppearances).toMatchObject({
      completeness: "complete",
      value: new Set(late ? ["mistmare", "giant_chicken_gold", "giant_chicken_white"] : []),
    });
    expect(fields.villagerRelationships).toMatchObject({
      completeness: "complete",
      value: late
        ? {
            adeline: "romantic",
            balor: "romantic",
            caldarus: "platonic",
            celine: "platonic",
            eiland: "romantic",
            hayden: "romantic",
            juniper: "romantic",
            march: "romantic",
            reina: "romantic",
            ryis: "married",
            seridia: "platonic",
            valen: "platonic",
          }
        : {},
    });
    expect(bundle.player?.children).toEqual([]);
    expect(bundle.player?.pending_child).toBeNull();
    expect(facts.pending_stork_visit).toBe(0);
    expect(fields.childChoice).toMatchObject({ completeness: "unknown", value: "undeclared" });
  });

  it("credits every reached rank even when its historical completion fact is false", () => {
    const facts = bundle.gamedata?.t2_world_facts as Record<string, unknown>;
    const renown = facts.renown as number;
    const { completed } = extractSaveProgress(bundle);
    const rankQuests = recordEntries(trackerData.quests.story).filter(
      ([, quest]) => quest.townRankLevel !== undefined,
    );
    expect(rankQuests).toHaveLength(9);
    const reachedQuests = rankQuests.filter(([id, quest]) => {
      const explicit = facts[`quest_${id}_complete`];
      return (
        (quest.townRankLevel !== undefined && quest.townRankLevel <= renown) ||
        explicit === 1 ||
        explicit === true
      );
    });
    for (const [id] of reachedQuests) expect(completed.questStates?.[id], id).toBe("completed");
  });

  it("retains the creation version & playtime that identify it", () => {
    const { identity } = extractSave(bundle);

    expect(identity.creationVersion.completeness).toBe("complete");
    expect(identity.creationVersion.value).toMatchObject({
      major: expect.any(Number) as unknown,
      minor: expect.any(Number) as unknown,
      patch: expect.any(Number) as unknown,
    });
    expect(identity.playtime.value).toBeGreaterThan(0);
  });
});

it("recovers the nine rank quests in the reported late-game save", async () => {
  const bundle = await readSave("game-1315159680-autosave.sav");
  const facts = bundle.gamedata?.t2_world_facts as Record<string, unknown>;
  expect(facts.renown).toBeGreaterThanOrEqual(100);
  expect(facts.quest_reach_copper_star_town_rank_complete).toBe(0);
  expect(facts.quest_reach_mistril_star_town_rank_complete).toBe(1);
  const { completed } = extractSaveProgress(bundle);
  const rankIds = recordEntries(trackerData.quests.story)
    .filter(([, quest]) => quest.townRankLevel !== undefined)
    .map(([id]) => id);
  expect(rankIds).toHaveLength(9);
  for (const id of rankIds) expect(completed.questStates?.[id], id).toBe("completed");
});

it("reads Ryis as the spouse in the reported married save, over its other dating flags", async () => {
  const bundle = await readSave("game-1315159680-autosave.sav");
  const facts = bundle.gamedata?.t2_world_facts as Record<string, unknown>;
  expect(facts.ryis_is_spouse).toBe(1);
  expect(facts.adeline_is_dating).toBe(1);
  const { completed } = extractSaveProgress(bundle);
  expect(completed.villagerRelationships?.["ryis" as VillagerId]).toBe("married");
  expect(completed.villagerRelationships?.["adeline" as VillagerId]).toBe("romantic");
  expect(completed.breakUpsDisabled).toBe(true);
  expect(
    Object.values(completed.villagerRelationships ?? {}).filter((rel) => rel === "romantic"),
  ).toHaveLength(7);
  expect(completed.childChoice).toBe("undeclared");
});

it("keeps the many-removals household warning for a late save over pre-provenance progress", async () => {
  const bundle = await readSave("game-1315159680-autosave.sav");
  const partners = ["adeline", "balor", "eiland", "hayden", "juniper", "march", "reina"];
  const fresh: SyncState = {
    farm: null,
    history: { provenance: {}, resolutions: {} },
    progress: makeCompletedState(),
  };
  const state: SyncState = {
    farm: readSaveIdentity(bundle).identity,
    history: {
      provenance: {
        "villagerRelationships/ryis": { source: "unknown" },
        ...Object.fromEntries(
          partners.map((id) => [`villagerRelationships/${id}`, { source: "inferred" as const }]),
        ),
      },
      resolutions: {},
    },
    progress: makeCompletedState({
      villagerRelationships: {
        ...Object.fromEntries(partners.map((id) => [id, "platonic" as const])),
        ["ryis" as VillagerId]: "married",
      },
    }),
  };
  const incoming = { extraction: extractSave(bundle), farm: readSaveIdentity(bundle).identity };
  const outcome = applySync(state, incoming, { fresh });
  expect(outcome.kind).toBe("ask");
  if (outcome.kind !== "ask") throw new Error("Expected the many-removals warning");
  expect(outcome.questions).toHaveLength(1);
  const [question] = outcome.questions;
  expect(question).toMatchObject({ field: "household", kind: "facts", reason: "many-removals" });
  if (question.kind !== "facts") throw new Error("Expected a household fact question");
  // Seven inferred friendships change laterally, four friendships are added, & break-ups change.
  expect(question.differences).toHaveLength(12);
  expect(
    question.differences
      .filter(({ direction }) => direction === "backward")
      .map(({ key }) => key)
      .toSorted(),
  ).toEqual(partners.map((id) => `villagerRelationships/${id}`).toSorted());
  expect(new Set(question.differences.map(({ field }) => field))).toEqual(
    new Set(["villagerRelationships", "breakUpsDisabled"]),
  );
  expect(question.differences.every(({ reason }) => reason === "many-removals")).toBe(true);
  for (const answer of ["keep", "accept"] as const) {
    const settled = applySync(state, incoming, { answers: { [question.id]: answer }, fresh });
    expect(settled.kind).toBe("applied");
    if (settled.kind !== "applied") throw new Error("The household answer did not settle");
    expect(settled.result.state.progress.villagerRelationships).toEqual(
      answer === "keep"
        ? state.progress.villagerRelationships
        : incoming.extraction.fields.villagerRelationships.value,
    );
    expect(settled.result.state.progress.breakUpsDisabled).toBe(answer === "accept");
  }
});

describe("fields mutated from a real save", () => {
  let bundle: SaveBundle;
  beforeAll(async () => {
    // The largest save is the furthest-played, so it has an entry in every field.
    const largest = SAVE_FILES.toSorted(
      (a, b) =>
        readFileSync(path.join(SAVE_DIR, b)).length - readFileSync(path.join(SAVE_DIR, a)).length,
    )[0];
    bundle = await readSave(largest);
  });

  it("leaves an absent field unknown with no value, keeping the rest complete", () => {
    const { fields } = extractSave(
      mutated(bundle, (copy) => {
        delete copy.player?.perks;
      }),
    );

    expect(fields.unlockedPerks).toMatchObject({
      completeness: "unknown",
      diagnostics: [{ code: "absent", path: "player.perks" }],
      value: undefined,
    });
    expect(fields.almanac.completeness).toBe("complete");
  });

  it("credits default cosmetics for an absent list without marking it complete", () => {
    const { fields } = extractSave(
      mutated(bundle, (copy) => {
        delete copy.player?.cosmetic_unlocks;
      }),
    );

    expect(fields.cosmetics.completeness).toBe("unknown");
    expect(fields.cosmetics.value?.size).toBeGreaterThan(0);
  });

  it("leaves a malformed field unknown with no value", () => {
    const { fields } = extractSave(
      mutated(bundle, (copy) => {
        if (copy.gamedata) copy.gamedata.museum_progress = "all of it";
      }),
    );

    expect(fields.museum).toMatchObject({
      completeness: "unknown",
      diagnostics: [{ code: "not-a-list", path: "gamedata.museum_progress" }],
      value: undefined,
    });
  });

  it("imports bought perks the player has switched off", () => {
    const player = bundle.player as {
      perks: string[];
      stats: { perks_active: Record<string, boolean> };
    };
    const switchedOff = Object.entries(player.stats.perks_active)
      .filter(([id, active]) => !active && player.perks.includes(id))
      .map(([id]) => id);
    expect(switchedOff.length).toBeGreaterThan(0);

    const imported = extractSave(bundle).fields.unlockedPerks.value ?? new Set();
    for (const id of switchedOff) expect(imported.has(id as never), id).toBe(true);
  });

  it("marks a field with a renamed ID unknown but keeps its other values", () => {
    const original = extractSave(bundle).fields.unlockedPerks.value ?? new Set();
    const [renamedId] = original;
    const renamed = mutated(bundle, (copy) => {
      const list = copy.player?.perks as string[];
      list[list.indexOf(renamedId)] = `${renamedId}_renamed`;
    });
    const { fields } = extractSave(renamed);

    expect(fields.unlockedPerks.completeness).toBe("unknown");
    expect(fields.unlockedPerks.diagnostics).toEqual([
      { code: "unknown-id", id: `${renamedId}_renamed`, path: "player.perks" },
    ]);
    expect(fields.unlockedPerks.value?.size).toBe(original.size - 1);

    // The additive import still merges every recognized value & warns about the renamed one.
    const { completed, warnings } = extractSaveProgress(renamed);
    expect(completed.unlockedPerks).toEqual(fields.unlockedPerks.value);
    expect(warnings).toContainEqual(fields.unlockedPerks.diagnostics[0]);
  });

  it.each([
    ["missing", undefined],
    ["renamed", "mount_horse"],
  ])("marks mount appearances unknown when the horse's list is %s", (_label, renamedKey) => {
    const { fields } = extractSave(
      mutated(bundle, (copy) => {
        const lists = copy.player?.animal_variant_unlocks as Record<string, unknown>;
        if (renamedKey) lists[renamedKey] = lists.horse;
        delete lists.horse;
      }),
    );

    expect(fields.mountAppearances.completeness).toBe("unknown");
    expect(fields.mountAppearances.value).toContain("mistmare");
    expect(fields.animals.completeness).toBe("unknown");
  });

  it("keeps the Mistmare complete when only its historical scene is renamed", () => {
    const { fields } = extractSave(
      mutated(bundle, (copy) => {
        const scenes = copy.gamedata?.scene_history as string[];
        expect(scenes).toContain("reveal_mistmare");
        scenes[scenes.indexOf("reveal_mistmare")] = "reveal_mistmare_renamed";
      }),
    );

    expect(fields.animals.completeness).toBe("complete");
    expect(fields.mountAppearances.completeness).toBe("complete");
    expect(fields.mountAppearances.value).toContain("mistmare");
  });

  it("marks levels unknown when a villager's heart level is missing", () => {
    const villagerId = Object.keys(trackerData.villagers)[0];
    const { fields } = extractSave(
      mutated(bundle, (copy) => {
        const facts = copy.gamedata?.t2_world_facts as Record<string, unknown>;
        delete facts[`${villagerId}_heart_level`];
      }),
    );

    expect(fields.heartLevels.completeness).toBe("unknown");
    expect(fields.skillLevels.completeness).toBe("complete");
  });
});
