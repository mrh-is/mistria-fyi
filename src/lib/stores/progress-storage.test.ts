import { describe, expect, it } from "vitest";

import {
  migrateDocument,
  MIGRATIONS,
  readProgressBlob,
  serializeProgress,
} from "#lib/stores/progress-storage.js";
import { CURRENT_SERIALIZATION_VERSION } from "#lib/types/user-progress.js";

import type {
  IngressPolicy,
  LoadedProgress,
  StoredDocument,
} from "#lib/stores/progress-storage.js";

const FIXTURES = import.meta.glob<StoredDocument>("./progress-storage-fixtures/v*.json", {
  eager: true,
  import: "default",
});
const POLICIES: IngressPolicy[] = ["repair", "strict"];

function fixture(version: number): StoredDocument {
  const path = `./progress-storage-fixtures/v${version}.json`;
  if (!Object.hasOwn(FIXTURES, path)) throw new Error(`Missing ${path}`);
  return FIXTURES[path];
}

function readOk(json: string, policy: IngressPolicy): LoadedProgress {
  const result = readProgressBlob(json, policy);
  if (result.kind !== "ok") throw new Error(`Expected a readable blob, got ${result.kind}`);
  return result.loaded;
}

function withVersion(version: unknown): string {
  return JSON.stringify({ ...fixture(CURRENT_SERIALIZATION_VERSION), version });
}

/** The history the version 1 & 2 fixtures migrate to: every fact they hold, `unknown`. */
const MIGRATED_FIXTURE_HISTORY = {
  provenance: Object.fromEntries(
    [
      // A historical almanac ID is keyed as the canonical entry hydration stores it under.
      "almanac/animated_waterfall_v1",
      "almanac/item_from_a_later_update",
      "almanac/turnip",
      "almanacRecipes/basic_wood_chest",
      "animalCosmetics/animal_from_a_later_update/ribbon_red",
      "animalCosmetics/chicken/ribbon_red",
      "animals/chicken/red",
      "animals/chicken/variant_from_a_later_update",
      "childChoice",
      "cosmetics/back_gear_ancient_witch_broom",
      "dates/inn_meal",
      "hasUpperFloor",
      "heartLevels/balor",
      "heartLevels/villager_from_a_later_update",
      "mineFloor",
      "museum/turnip",
      "petCosmetics/flower_crown",
      "petSkins/sapling",
      "questStates/repair_the_general_store",
      "reachedSeason",
      "renown",
      "skillLevels/farming",
      "spells/summon_rain",
      "unlockedPerks/museum_quality_one",
      "villagerRelationships/balor",
    ].map((key) => [key, { source: "unknown" }]),
  ),
  resolutions: {},
};

describe("migration table", () => {
  it("has one contiguous step per version up to this build's", () => {
    const versions = Object.keys(MIGRATIONS).map(Number);
    expect(versions).toEqual(
      Array.from({ length: CURRENT_SERIALIZATION_VERSION }, (_, i) => i + 1),
    );
  });

  it("keeps a fixture for every version", () => {
    const fixtureVersions = Object.keys(FIXTURES)
      .map((path) => Number(/v(\d+)\.json$/.exec(path)?.[1]))
      .toSorted((a, b) => a - b);
    expect(fixtureVersions).toEqual(Object.keys(MIGRATIONS).map(Number));
  });

  it("keeps the launch format's step as the identity", () => {
    const document = fixture(1);
    expect(MIGRATIONS[1]?.(document)).toBe(document);
  });
});

describe("migrateDocument", () => {
  const chain = {
    1: (document: StoredDocument) => document,
    2: (document: StoredDocument) => ({ ...document, steps: ["2"] }),
    3: (document: StoredDocument) => ({
      ...document,
      steps: [...(document.steps as string[]), "3"],
    }),
  };

  it("runs every step after the stored version, in order, stamping each result", () => {
    expect(migrateDocument({ version: 1 }, 1, chain, 3)).toEqual({ steps: ["2", "3"], version: 3 });
    expect(migrateDocument({ steps: ["2"], version: 2 }, 2, chain, 3)).toEqual({
      steps: ["2", "3"],
      version: 3,
    });
  });

  it("leaves a current document as it is", () => {
    const document = { version: 3 };
    expect(migrateDocument(document, 3, chain, 3)).toBe(document);
  });

  it("throws on a gap in the chain", () => {
    expect(() => migrateDocument({ version: 1 }, 1, { 1: chain[1], 3: chain[3] }, 3)).toThrow(
      "No storage migration produces version 2",
    );
  });
});

describe("readProgressBlob", () => {
  it.each(POLICIES)("migrates launch progress without inventing import history (%s)", (policy) => {
    const loaded = readOk(JSON.stringify(fixture(1)), policy);
    expect(loaded.lastImport).toBeNull();
    expect(loaded.progress.renown).toBe(17);
  });

  it.each(POLICIES)("round-trips identity and display metadata (%s)", (policy) => {
    const loaded = readOk(JSON.stringify(fixture(2)), policy);
    expect(loaded.lastImport).toEqual(fixture(2).lastImport);
    expect(readOk(serializeProgress(loaded), policy).lastImport).toEqual(loaded.lastImport);
  });

  it("repairs invalid import metadata on hydration and rejects it in a backup", () => {
    const json = JSON.stringify({ ...fixture(2), lastImport: { importedAt: -1 } });
    expect(readOk(json, "repair").lastImport).toBeNull();
    expect(readProgressBlob(json, "strict").kind).toBe("unreadable");
  });

  it.each(POLICIES)("reads every version's fixture under the %s policy", (policy) => {
    for (const version of Object.keys(MIGRATIONS).map(Number)) {
      const loaded = readOk(JSON.stringify(fixture(version)), policy);
      const written = JSON.parse(serializeProgress(loaded)) as StoredDocument;
      expect(written.version, `v${version}`).toBe(CURRENT_SERIALIZATION_VERSION);
    }
  });

  // Version 2 shipped (#188), so real players hold it as well as version 1.
  it.each([1, 2].flatMap((version) => POLICIES.map((policy) => [version, policy] as const)))(
    "marks every fact a version %i blob holds unknown (%s)",
    (version, policy) => {
      const stored = fixture(version);
      const loaded = readOk(JSON.stringify(stored), policy);
      expect(loaded.history).toEqual(MIGRATED_FIXTURE_HISTORY);
      expect(loaded.lastImport).toEqual(stored.lastImport ?? null);

      const written = JSON.parse(serializeProgress(loaded)) as StoredDocument;
      expect(written).toMatchObject({
        lastImport: stored.lastImport ?? null,
        progress: MIGRATED_FIXTURE_HISTORY,
        version: CURRENT_SERIALIZATION_VERSION,
      });
      expect(readOk(JSON.stringify(written), "strict").history).toEqual(MIGRATED_FIXTURE_HISTORY);
    },
  );

  it.each(POLICIES)("reads version 3's history as stored (%s)", (policy) => {
    const stored = fixture(3) as { progress: Record<string, unknown> };
    const { history } = readOk(JSON.stringify(stored), policy);

    expect(history).toEqual({
      lastSavePlaytime: stored.progress.lastSavePlaytime,
      provenance: stored.progress.provenance,
      resolutions: stored.progress.resolutions,
    });
    const written = JSON.parse(serializeProgress(readOk(JSON.stringify(stored), policy))) as {
      progress: Record<string, unknown>;
    };
    expect(written.progress).toMatchObject({
      lastSavePlaytime: stored.progress.lastSavePlaytime,
      provenance: stored.progress.provenance,
      resolutions: stored.progress.resolutions,
    });
  });

  it("drops malformed history entries on hydration but rejects them in a backup", () => {
    const stored = fixture(3) as { progress: Record<string, unknown> };
    const json = JSON.stringify({
      ...stored,
      progress: {
        ...stored.progress,
        lastSavePlaytime: -1,
        provenance: { mineFloor: { source: "guess" }, renown: { source: "manual" } },
        resolutions: { mineFloor: {}, renown: { saveValue: 3 } },
      },
    });

    expect(readProgressBlob(json, "strict").kind).toBe("unreadable");
    expect(readOk(json, "repair").history).toEqual({
      provenance: { renown: { source: "manual" } },
      resolutions: { renown: { saveValue: 3 } },
    });
  });

  it("keys a version 1 blob's levels only as hydration stores them", () => {
    const { progress } = fixture(1) as { progress: Record<string, unknown> };
    const json = JSON.stringify({
      ...fixture(1),
      progress: {
        ...progress,
        heartLevels: { balor: 0.5, villager_from_a_later_update: 0.5 },
        mineFloor: 0.5,
        renown: 0.5,
      },
    });
    // Strict restore refuses a fractional level for a known ID outright.
    const { history } = readOk(json, "repair");

    // Floored to zero, so the facts are at their default and have nothing to record.
    expect(history.provenance).not.toHaveProperty("heartLevels/balor");
    expect(history.provenance).not.toHaveProperty("mineFloor");
    expect(history.provenance).not.toHaveProperty("renown");
    // An unknown ID's level is retained as stored, so that fact is.
    expect(history.provenance).toHaveProperty("heartLevels/villager_from_a_later_update");
  });

  it("keys no fact for a version 1 value hydration repairs to its default", () => {
    const { progress } = fixture(1) as { progress: Record<string, unknown> };
    const json = JSON.stringify({
      ...fixture(1),
      progress: {
        ...progress,
        questStates: { repair_the_general_store: "bogus" },
        reachedSeason: "bogus",
        villagerRelationships: { balor: "bogus" },
      },
    });
    const { history } = readOk(json, "repair");

    expect(history.provenance).not.toHaveProperty("questStates/repair_the_general_store");
    expect(history.provenance).not.toHaveProperty("reachedSeason");
    expect(history.provenance).not.toHaveProperty("villagerRelationships/balor");
  });

  it.each([1, 2])(
    "records the relationships a marriage cascade sets as inferred (v%i)",
    (version) => {
      const { progress } = fixture(version) as { progress: Record<string, unknown> };
      const json = JSON.stringify({
        ...fixture(version),
        progress: { ...progress, villagerRelationships: { balor: "married" } },
      });
      const { history, progress: loaded } = readOk(json, "repair");

      const platonic = Object.entries(loaded.villagerRelationships)
        .filter(([, relationship]) => relationship === "platonic")
        .map(([id]) => id);
      expect(platonic.length).toBeGreaterThan(0);
      for (const id of platonic) {
        expect(history.provenance[`villagerRelationships/${id}`]?.source, id).toBe("inferred");
      }
    },
  );

  it("marks a version 1 blob's married villager unknown, beside the inferred cascade", () => {
    const { progress } = fixture(1) as { progress: Record<string, unknown> };
    const json = JSON.stringify({
      ...fixture(1),
      progress: { ...progress, villagerRelationships: { balor: "married" } },
    });

    expect(readOk(json, "repair").history.provenance["villagerRelationships/balor"]).toEqual({
      source: "unknown",
    });
  });

  it.each(POLICIES)("rekeys a historical almanac ID's history under its entry (%s)", (policy) => {
    const stored = fixture(3) as { progress: Record<string, unknown> };
    const json = JSON.stringify({
      ...stored,
      progress: {
        ...stored.progress,
        almanac: ["animated_waterfall_v2", "turnip"],
        provenance: {
          "almanac/animated_waterfall_v2": { source: "manual" },
          "almanac/turnip": { source: "save" },
          "almanac/turnip_from_a_later_update": { source: "manual" },
        },
        resolutions: { "almanac/animated_waterfall_v2": { saveValue: null } },
      },
    });
    const { history, progress } = readOk(json, policy);

    expect(progress.almanac).toEqual(new Set(["animated_waterfall_v1", "turnip"]));
    expect(history.provenance).toEqual({
      "almanac/animated_waterfall_v1": { source: "manual" },
      "almanac/turnip": { source: "save" },
      "almanac/turnip_from_a_later_update": { source: "manual" },
    });
    expect(history.resolutions).toEqual({
      "almanac/animated_waterfall_v1": { saveValue: null },
    });
  });

  it("keeps an entry already under the canonical key over a member's", () => {
    const stored = fixture(3) as { progress: Record<string, unknown> };
    const json = JSON.stringify({
      ...stored,
      progress: {
        ...stored.progress,
        provenance: {
          "almanac/animated_waterfall_v1": { source: "save" },
          "almanac/animated_waterfall_v2": { source: "manual" },
        },
      },
    });

    expect(readOk(json, "repair").history.provenance).toMatchObject({
      "almanac/animated_waterfall_v1": { source: "save" },
    });
    expect(readOk(json, "repair").history.provenance).not.toHaveProperty(
      "almanac/animated_waterfall_v2",
    );
  });

  it.each([null, "x", 5])("drops a malformed history container (%j) on hydration only", (bad) => {
    const stored = fixture(3) as { progress: Record<string, unknown> };
    const json = JSON.stringify({
      ...stored,
      progress: { ...stored.progress, provenance: bad, resolutions: bad },
    });

    expect(readProgressBlob(json, "strict").kind).toBe("unreadable");
    const loaded = readOk(json, "repair");
    expect(loaded.history.provenance).toEqual({});
    expect(loaded.history.resolutions).toEqual({});
    expect(loaded.progress.renown).toBe(17);
  });

  it.each(POLICIES)("reports a newer version under the %s policy without reading it", (policy) => {
    const newer = CURRENT_SERIALIZATION_VERSION + 1;
    // A newer build may change any field, so even an unrecognizable body is reported as newer.
    expect(
      readProgressBlob(JSON.stringify({ progress: "reshaped", version: newer }), policy),
    ).toEqual({ kind: "newer", version: newer });
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
    ["text", "1"],
    ["null", null],
  ])("treats a %s version as unreadable", (_, version) => {
    for (const policy of POLICIES) {
      expect(readProgressBlob(withVersion(version), policy), policy).toEqual({
        error: "invalid-fields",
        kind: "unreadable",
      });
    }
  });

  it.each([
    ["malformed JSON", "{not json"],
    ["a JSON string", '"progress"'],
    ["JSON null", "null"],
  ])("treats %s as malformed", (_, json) => {
    expect(readProgressBlob(json, "repair")).toEqual({
      error: "malformed-json",
      kind: "unreadable",
    });
  });

  it.each(POLICIES)("retains unknown IDs & writes them back under the %s policy", (policy) => {
    const loaded = readOk(JSON.stringify(fixture(1)), policy);

    expect(loaded.progress.almanac).toEqual(new Set(["turnip", "animated_waterfall_v1"]));
    expect(loaded.progress.heartLevels).toEqual({ balor: 4 });
    expect(loaded.progress.animals).not.toHaveProperty("animal_from_a_later_update");
    expect(loaded.progress.animals).toHaveProperty("chicken", new Set(["red"]));

    const written = JSON.parse(serializeProgress(loaded)) as {
      progress: Record<string, unknown>;
    };
    expect(written.progress).toMatchObject({
      almanac: ["animated_waterfall_v1", "item_from_a_later_update", "turnip"],
      animalCosmetics: {
        animal_from_a_later_update: ["ribbon_red"],
        chicken: ["ribbon_red"],
      },
      animals: { chicken: ["red", "variant_from_a_later_update"] },
      heartLevels: { balor: 4, villager_from_a_later_update: 12 },
    });
  });

  it("drops fields the format doesn't declare", () => {
    const loaded = readOk(JSON.stringify(fixture(1)), "strict");
    expect(JSON.parse(serializeProgress(loaded))).not.toHaveProperty("showCompleted");
  });

  it("repairs malformed values on hydration but rejects them in a backup", () => {
    const document = fixture(CURRENT_SERIALIZATION_VERSION);
    const json = JSON.stringify({
      ...document,
      progress: { ...(document.progress as object), childChoice: "maybe", renown: "max" },
    });

    expect(readProgressBlob(json, "strict")).toEqual({
      error: "invalid-fields",
      kind: "unreadable",
    });
    const repaired = readOk(json, "repair");
    expect(repaired.progress.childChoice).toBe("undeclared");
    expect(repaired.progress.renown).toBe(0);
  });

  it("writes hydrated progress back as a backup that restores", () => {
    const document = fixture(CURRENT_SERIALIZATION_VERSION);
    const progress = document.progress as Record<string, unknown>;
    const json = JSON.stringify({
      ...document,
      progress: {
        ...progress,
        // Known IDs out of this build's domain, which hydration clamps…
        heartLevels: { balor: 40.7, villager_from_a_later_update: 4.5 },
        mineFloor: 1e9,
        // …and unknown IDs, which it retains as stored.
        skillLevels: { farming: 3.2, skill_from_a_later_update: 150 },
      },
    });
    expect(readProgressBlob(json, "strict").kind).toBe("unreadable");

    const hydrated = readOk(json, "repair");
    const written = serializeProgress(hydrated);
    const restored = readOk(written, "strict");

    expect(JSON.parse(serializeProgress(restored))).toEqual(JSON.parse(written));
    expect(JSON.parse(written)).toMatchObject({
      progress: {
        heartLevels: { balor: 10, villager_from_a_later_update: 4.5 },
        skillLevels: { farming: 3, skill_from_a_later_update: 150 },
      },
    });
  });

  it("keeps known IDs to this build's level domain in a backup", () => {
    const document = fixture(CURRENT_SERIALIZATION_VERSION);
    for (const levels of [{ heartLevels: { balor: 4.5 } }, { skillLevels: { farming: 1000 } }]) {
      const json = JSON.stringify({
        ...document,
        progress: { ...(document.progress as object), ...levels },
      });
      expect(readProgressBlob(json, "strict"), JSON.stringify(levels)).toEqual({
        error: "invalid-fields",
        kind: "unreadable",
      });
    }
  });
});
