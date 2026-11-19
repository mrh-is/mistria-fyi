import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { expect, it } from "vitest";

import { extractSaveProgress, unpackSavFile } from "#lib/engine/import-save.js";
import { createDefaultProgress } from "#lib/engine/progress-fields.js";
import { readGameDate } from "#lib/engine/sync-freshness.js";
import {
  emptyProgressHistory,
  emptyRetainedProgress,
  readProgressBlob,
  serializeProgress,
} from "#lib/stores/progress-storage.js";

// The same three snapshots used by the round-ten mockup. Verify the date because two
// files share a basename, and the current autosaves can be replaced in the shared folder.
const saves = {
  "day-one": {
    date: { day: 1, season: "spring", year: 1 },
    donations: 0,
    file: "v1.0.8/save/game-1720221376-autosave.sav",
  },
  "late-game": {
    date: { day: 2, season: "fall", year: 2 },
    donations: 408,
    file: "v1.0.8/save/game-1315159680-autosave.sav",
  },
  "mid-game": {
    date: { day: 14, season: "spring", year: 2 },
    donations: 350,
    file: "archive/Save file/game-1315159680-autosave.sav",
  },
} as const;

const fixtureFile = new URL("../../scripts/fixtures/field-guide-progress.json", import.meta.url);

async function exportFixtures(): Promise<void> {
  const fixtures = Object.fromEntries(
    await Promise.all(
      Object.entries(saves).map(
        async ([
          preset,
          {
            date: { day, season, year },
            file,
          },
        ]) => {
          const bytes = await readFile(resolve("pipeline/input", file));
          const bundle = await unpackSavFile(new File([bytes], basename(file)));
          const date = readGameDate(bundle);
          if (date?.season !== season || date.day !== day || date.year !== year) {
            throw new Error(`${preset}: expected ${season} ${day}, year ${year} in ${file}`);
          }
          const { completed, day: worldDay } = extractSaveProgress(bundle);
          if (worldDay.weather === undefined) {
            throw new Error(`${preset}: unreadable weather in ${file}`);
          }
          const serialized = serializeProgress({
            history: emptyProgressHistory(),
            progress: { ...createDefaultProgress(), ...completed },
            retained: emptyRetainedProgress(),
            worldState: { day, season, weather: worldDay.weather },
          });
          if (readProgressBlob(serialized, "strict").kind !== "ok") {
            throw new Error(`${preset}: invalid progress export`);
          }
          return [preset, JSON.parse(serialized) as unknown] as const;
        },
      ),
    ),
  );

  await writeFile(fixtureFile, `${JSON.stringify(fixtures, null, 2)}\n`);
}

it("loads the three field guide progress exports", async () => {
  if (process.env.FIELD_GUIDE_REFRESH === "1") await exportFixtures();

  const fixtures = JSON.parse(await readFile(fixtureFile, "utf8")) as Record<string, unknown>;
  expect(Object.keys(fixtures).toSorted()).toEqual(Object.keys(saves).toSorted());
  for (const [
    preset,
    {
      date: { day, season },
      donations,
    },
  ] of Object.entries(saves)) {
    const read = readProgressBlob(JSON.stringify(fixtures[preset]), "strict");
    expect(read.kind, preset).toBe("ok");
    if (read.kind !== "ok") throw new Error(`Invalid ${preset} progress`);
    expect(read.loaded.worldState, preset).toMatchObject({ day, season });
    const { lastImport, progress, retained } = read.loaded;
    expect(lastImport, preset).toBeNull();
    expect(progress.museum.size + (retained.lists.museum?.length ?? 0), preset).toBe(donations);
  }
});
