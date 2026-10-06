import { beforeEach, describe, expect, it } from "vitest";

import { CATEGORY_KEYS, sortCategoryKeysByName } from "#lib/data/categories.js";
import { pageMetadata } from "#lib/data/page-metadata.js";
import { getAllProgress, getMaxRenownLevel, getOverallProgress } from "#lib/engine/progress.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderToFragmentWithFeedback } from "#lib/test-utils/render-to-fragment-with-feedback.js";
import { formatNumber } from "#lib/utils/format.js";

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
    const { container } = renderToFragmentWithFeedback(AllPage, { props });

    for (const key of CATEGORY_KEYS) {
      expect(container.querySelector(`#category-${key}`)).not.toBeNull();
    }
  });

  it("orders sections alphabetically by category name, matching the home page", () => {
    const { container } = renderToFragmentWithFeedback(AllPage, { props });

    const expectedOrder = sortCategoryKeysByName(CATEGORY_KEYS, "en");
    const renderedOrder = [...container.querySelectorAll("[id^='category-']")].map((element) =>
      element.id.replace("category-", ""),
    );

    expect(renderedOrder).toEqual(expectedOrder);
  });

  it("reconciles the header total with every rendered category, recipes included", () => {
    const progress = getAllProgress({
      availabilityWindows: userState.state.availabilityWindows,
      completed: userState.state.completed,
      worldState: userState.state.worldState,
    });
    const overall = getOverallProgress(progress);
    expect(progress.recipes.total).toBeGreaterThan(0);

    const { queries } = renderToFragmentWithFeedback(AllPage, { props });

    expect(
      queries.getByText(
        `${formatNumber(overall.completed, "en")} of ${formatNumber(overall.total, "en")} completed`,
      ),
    ).toBeTruthy();
  });

  it("hides a completed category unless completed content is shown", () => {
    userState.setRenown(getMaxRenownLevel());

    const hidden = renderToFragmentWithFeedback(AllPage, { props });
    expect(hidden.container.querySelector("#category-renown")).toBeNull();
    expect(hidden.container.querySelector("#category-skills")).not.toBeNull();

    userState.toggleShowCompleted();
    const shown = renderToFragmentWithFeedback(AllPage, { props });
    expect(shown.container.querySelector("#category-renown")).not.toBeNull();
  });

  it("labels each section by its header and tints it with the category color", () => {
    const { container } = renderToFragmentWithFeedback(AllPage, { props });

    for (const key of CATEGORY_KEYS) {
      const section = container.querySelector(`section[aria-labelledby="category-${key}"]`);
      expect(section, key).not.toBeNull();
      expect(section?.getAttribute("style"), key).toContain(`--primary: var(--cat-${key})`);
    }
  });
});
