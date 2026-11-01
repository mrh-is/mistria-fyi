import { afterEach, expect, it, vi } from "vitest";

import { PROGRESS_STORAGE_KEY } from "#lib/stores/storage-keys.js";
import { memoryStorage } from "#lib/test-utils/memory-storage.js";
import { CURRENT_SERIALIZATION_VERSION } from "#lib/types/user-progress.js";

import { progressAttachment } from "./progress-attachment.js";

afterEach(() => vi.unstubAllGlobals());

it("projects a newer build’s raw backup without publishing its unclassified fields", async () => {
  vi.resetModules();
  const progress = {
    almanac: ["future_game_item"],
    futureField: { characterName: "private-character", sessionSeconds: 42 },
    provenance: { renown: { farmName: "private-farm", source: "save" } },
    renown: 7,
  };
  vi.stubGlobal(
    "localStorage",
    memoryStorage({
      [PROGRESS_STORAGE_KEY]: JSON.stringify({
        progress,
        version: CURRENT_SERIALIZATION_VERSION + 1,
        worldState: { season: "spring", weather: "calm" },
      }),
    }),
  );
  const { userState } = await import("#lib/stores/user-state.svelte.js");
  userState.loadFromStorage();
  const backup = JSON.parse(userState.exportBackup()) as { progress: Record<string, unknown> };
  expect(backup.progress).toEqual(progress);
  expect(progressAttachment(backup.progress)).toEqual({
    almanac: ["future_game_item"],
    provenance: { renown: { source: "save" } },
    renown: 7,
  });
});
