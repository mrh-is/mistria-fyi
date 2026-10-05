import { afterEach, beforeEach, describe, expect, it } from "vitest";

import OverallProgress from "#lib/components/overall-progress.svelte";
import { getAllProgress } from "#lib/engine/progress.js";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";
import { formatNumber } from "#lib/utils/format.js";

describe("OverallProgress", () => {
  const defaultGetLocale = getLocale;

  beforeEach(() => {
    userState.resetAll();
  });

  afterEach(() => {
    overwriteGetLocale(defaultGetLocale);
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

    const { queries } = renderToFragment(OverallProgress, { props: { progress } });

    expect(
      queries.getByRole("img", {
        name: `0 of ${formatNumber(expectedTotal, "en")} completed overall, 0%`,
      }),
    ).toBeTruthy();
  });

  it("localizes the overall progress label for Japanese", () => {
    overwriteGetLocale(() => "ja");
    const progress = getAllProgress({
      availabilityWindows: userState.state.availabilityWindows,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    });
    const expectedTotal = Object.values(progress).reduce(
      (sum, category) => sum + category.total,
      0,
    );

    const { queries } = renderToFragment(OverallProgress, { props: { progress } });

    expect(
      queries.getByRole("img", {
        name: `全体で${formatNumber(expectedTotal, "ja")}件中0件完了、0%`,
      }),
    ).toBeTruthy();
  });

  it("localizes the overall progress label for Russian", () => {
    overwriteGetLocale(() => "ru");
    const progress = getAllProgress({
      availabilityWindows: userState.state.availabilityWindows,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    });
    const expectedTotal = Object.values(progress).reduce(
      (sum, category) => sum + category.total,
      0,
    );

    const { queries } = renderToFragment(OverallProgress, { props: { progress } });

    expect(
      queries.getByRole("img", {
        name: `Выполнено 0 из ${formatNumber(expectedTotal, "ru")} всего, 0\u00A0%`,
      }),
    ).toBeTruthy();
  });
});
