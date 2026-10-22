import { afterEach, beforeEach, describe, expect, it } from "vitest";

import OverallProgress from "#lib/components/overall-progress.svelte";
import { getAllProgress } from "#lib/engine/categories.js";
import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";
import { formatNumber } from "#lib/utils/format.js";
import { page } from "$app/state";

describe("OverallProgress", () => {
  const defaultGetLocale = getLocale;

  beforeEach(() => {
    userState.resetAll();
  });

  afterEach(() => {
    overwriteGetLocale(defaultGetLocale);
    page.data.locale = "en";
  });

  it("includes every category in the overall total", () => {
    const progress = getAllProgress({
      availabilityWindows: userState.state.availabilityWindows,
      progress: userState.state.progress,
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
    page.data.locale = "ja";
    const progress = getAllProgress({
      availabilityWindows: userState.state.availabilityWindows,
      progress: userState.state.progress,
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
    page.data.locale = "ru";
    const progress = getAllProgress({
      availabilityWindows: userState.state.availabilityWindows,
      progress: userState.state.progress,
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
