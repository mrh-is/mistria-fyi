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
  it.each(POLICIES)("reads every version's fixture under the %s policy", (policy) => {
    for (const version of Object.keys(MIGRATIONS).map(Number)) {
      const loaded = readOk(JSON.stringify(fixture(version)), policy);
      const written = JSON.parse(serializeProgress(loaded, loaded.retained)) as StoredDocument;
      expect(written.version, `v${version}`).toBe(CURRENT_SERIALIZATION_VERSION);
    }
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

    const written = JSON.parse(serializeProgress(loaded, loaded.retained)) as {
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
    expect(JSON.parse(serializeProgress(loaded, loaded.retained))).not.toHaveProperty(
      "showCompleted",
    );
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
    const written = serializeProgress(hydrated, hydrated.retained);
    const restored = readOk(written, "strict");

    expect(JSON.parse(serializeProgress(restored, restored.retained))).toEqual(JSON.parse(written));
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
