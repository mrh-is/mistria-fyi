import { render } from "svelte/server";
import { beforeEach, describe, expect, it } from "vitest";

import OverallProgress from "$lib/components/overall-progress.svelte";
import { getAllProgress } from "$lib/engine/progress.js";
import { userState } from "$lib/stores/user-state.svelte.js";

describe("OverallProgress", () => {
  beforeEach(() => {
    userState.resetAll();
  });

  it("includes every category in the overall total", () => {
    const progress = getAllProgress({
      availabilityWindows: userState.state.availabilityWindows,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    });
    const expectedTotal = Object.values(progress).reduce(
      (sum, category) => sum + category.total,
      0,
    );

    const { body } = render(OverallProgress);

    expect(body).toContain(`aria-label="0 of ${expectedTotal.toString()} completed overall, 0%"`);
  });
});
