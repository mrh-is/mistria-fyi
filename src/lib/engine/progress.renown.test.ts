import { describe, expect, it } from "vitest";

import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { AVAILABILITY_WINDOWS } from "#lib/types/availability.js";

import { getCategoryProgress } from "./progress.js";

import type { CompletedState } from "#lib/types/user-progress.js";

function completedAtRenown(renown: number): CompletedState {
  return makeCompletedState({ renown });
}

describe("renown maximum", () => {
  it("reports max level as complete", () => {
    const progress = getCategoryProgress("renown", {
      availabilityWindows: AVAILABILITY_WINDOWS,
      completed: completedAtRenown(100),
      worldState: { season: "spring", weather: "calm" },
    });

    expect(progress).toEqual({ completed: 100, filtered: 0, total: 100 });
  });

  it("normalizes progress saved above max level", () => {
    const progress = getCategoryProgress("renown", {
      availabilityWindows: AVAILABILITY_WINDOWS,
      completed: completedAtRenown(120),
      worldState: { season: "spring", weather: "calm" },
    });

    expect(progress).toEqual({ completed: 100, filtered: 0, total: 100 });
  });
});
