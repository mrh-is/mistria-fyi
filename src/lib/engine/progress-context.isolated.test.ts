import { expect, it, vi } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";

import { createProgressContext } from "./progress.js";
import { deriveProgressionState } from "./visibility.js";

import type { TrackerData } from "#lib/types/tracker-data.js";

const { readMuseum } = vi.hoisted(() => ({
  readMuseum: vi.fn<() => TrackerData["museum"]>(),
}));

vi.mock(import("#lib/data/index.js"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    trackerData: {
      ...actual.trackerData,
      get museum() {
        return readMuseum();
      },
    },
  };
});

it.each([
  { museum: {}, name: "a missing Archaeology wing" },
  { museum: { archaeology: { sets: { empty: { items: [] } } } }, name: "an empty set" },
])("keeps the replicator locked with $name", ({ museum }) => {
  readMuseum.mockReturnValue(museum);
  const progress = makeCompletedState();
  const ctx = createProgressContext(
    progress,
    deriveProgressionState(progress, trackerData, false),
    {
      season: "spring",
      weather: "calm",
    },
  );
  expect(ctx.replicatorUnlocked).toBe(false);
});
