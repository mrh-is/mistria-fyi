import { render } from "svelte/server";
import { beforeEach, describe, expect, it } from "vitest";

import { CATEGORY_KEYS, sortCategoryKeysByName } from "$lib/data/categories.js";
import { pageMetadata } from "$lib/data/page-metadata.js";
import { getAllProgress, getOverallProgress } from "$lib/engine/progress.js";
import { userState } from "$lib/stores/user-state.svelte.js";
import { formatNumber } from "$lib/utils/format.js";

import AllPage from "./+page.svelte";

const props = {
  data: {
    locale: "en" as const,
    metadata: pageMetadata({ description: "test", title: "Everything" }),
  },
  params: {},
};

beforeEach(() => {
  userState.resetAll();
});

describe("/all page", () => {
  it("renders a section for every category, including recipes", () => {
    const { body } = render(AllPage, { props });

    for (const key of CATEGORY_KEYS) {
      expect(body).toContain(`id="category-${key}"`);
    }
  });

  it("orders sections alphabetically by category name, matching the home page", () => {
    const { body } = render(AllPage, { props });

    const expectedOrder = sortCategoryKeysByName(CATEGORY_KEYS, "en");
    const positions = expectedOrder.map((key) => {
      const index = body.indexOf(`id="category-${key}"`);
      expect(index).toBeGreaterThan(-1);
      return index;
    });

    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("reconciles the header total with every rendered category, recipes included", () => {
    const progress = getAllProgress({
      availabilityWindows: userState.state.availabilityWindows,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    });
    const overall = getOverallProgress(progress);
    expect(progress.recipes.total).toBeGreaterThan(0);

    const { body } = render(AllPage, { props });

    expect(body).toContain(
      `${formatNumber(overall.completed, "en")} of ${formatNumber(overall.total, "en")} completed`,
    );
  });
});
