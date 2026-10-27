import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { AVAILABILITY_WINDOWS } from "#lib/types/availability.js";

import { getCategoryProgress } from "./categories.js";

import type { ProgressState } from "#lib/types/user-progress.js";

function completedAtRenown(renown: number): ProgressState {
  return makeCompletedState({ renown });
}

describe("renown maximum", () => {
  it("reports max level as complete", () => {
    const progress = getCategoryProgress("renown", {
      availabilityWindows: AVAILABILITY_WINDOWS,
      progress: completedAtRenown(100),
      progressionState: deriveProgressionState(completedAtRenown(100), trackerData, false),
      worldState: { season: "spring", weather: "calm" },
    });

    expect(progress).toEqual({ completed: 100, remainingInScope: 0, total: 100 });
  });

  it("normalizes progress saved above max level", () => {
    const progress = getCategoryProgress("renown", {
      availabilityWindows: AVAILABILITY_WINDOWS,
      progress: completedAtRenown(120),
      progressionState: deriveProgressionState(completedAtRenown(120), trackerData, false),
      worldState: { season: "spring", weather: "calm" },
    });

    expect(progress).toEqual({ completed: 100, remainingInScope: 0, total: 100 });
  });
});
