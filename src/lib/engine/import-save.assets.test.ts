import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";

import { extractSave, extractSaveProgress } from "./import-save.js";
import { parseSavArchive } from "./parse-sav.js";

import type { SaveBundle, SaveExtraction } from "./import-save.js";

// Real saves for the committed tracker data's game version, read locally & never committed.
const SAVE_DIR = path.join(
  fileURLToPath(new URL("../../../pipeline/input", import.meta.url)),
  `v${trackerData.version}`,
  "save",
);
const SAVE_FILES = readdirSync(SAVE_DIR).filter((name) => name.endsWith(".sav"));
/** Fields a save never fully determines (see `PARTIAL_FIELDS` in `import-save.ts`). */
const PARTIAL_KEYS = new Set(["mountAppearances", "villagerRelationships"]);

async function readSave(name: string): Promise<SaveBundle> {
  return parseSavArchive(new File([readFileSync(path.join(SAVE_DIR, name))], name));
}

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

  it("holds no unrecognized IDs, so every field it fully records is complete", () => {
    const extraction = extractSave(bundle);

    expect(unrecognized(extraction)).toEqual([]);
    for (const [key, field] of Object.entries(extraction.fields)) {
      const expected = PARTIAL_KEYS.has(key) ? "unknown" : "complete";
      expect(field.completeness, `${key}: ${JSON.stringify(field.diagnostics)}`).toBe(expected);
    }
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
        delete copy.player?.cosmetic_unlocks;
      }),
    );

    expect(fields.cosmetics).toMatchObject({
      completeness: "unknown",
      diagnostics: [{ code: "absent", path: "player.cosmetic_unlocks" }],
      value: undefined,
    });
    expect(fields.almanac.completeness).toBe("complete");
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

  it("marks a field with a renamed ID unknown but keeps its other values", () => {
    const original = extractSave(bundle).fields.cosmetics.value ?? new Set();
    const [renamedId] = original;
    const renamed = mutated(bundle, (copy) => {
      const list = copy.player?.cosmetic_unlocks as string[];
      list[list.indexOf(renamedId)] = `${renamedId}_renamed`;
    });
    const { fields } = extractSave(renamed);

    expect(fields.cosmetics.completeness).toBe("unknown");
    expect(fields.cosmetics.diagnostics).toEqual([
      { code: "unknown-id", id: `${renamedId}_renamed`, path: "player.cosmetic_unlocks" },
    ]);
    expect(fields.cosmetics.value?.size).toBe(original.size - 1);

    // The additive import still merges every recognized value & warns about the renamed one.
    const { completed, warnings } = extractSaveProgress(renamed);
    expect(completed.cosmetics).toEqual(fields.cosmetics.value);
    expect(warnings).toContainEqual(fields.cosmetics.diagnostics[0]);
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

  it("keeps mount appearances unknown when the Mistmare's reveal scene is renamed", () => {
    const { fields } = extractSave(
      mutated(bundle, (copy) => {
        const scenes = copy.gamedata?.scene_history as string[];
        scenes[scenes.indexOf("reveal_mistmare")] = "reveal_mistmare_renamed";
      }),
    );

    expect(fields.animals.completeness).toBe("complete");
    expect(fields.mountAppearances.completeness).toBe("unknown");
    expect(fields.mountAppearances.value).not.toContain("mistmare");
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
