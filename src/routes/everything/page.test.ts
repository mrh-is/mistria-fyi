import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { sortCategoryKeysByName } from "#lib/data/categories.js";
import { pageMetadata } from "#lib/data/page-metadata.js";
import { CATEGORY_KEYS, getAllProgress, getOverallProgress } from "#lib/engine/categories.js";
import { getMaxRenownLevel } from "#lib/engine/progress.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
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
  pageStub.reset();
});

describe("/everything page", () => {
  // A full render of every category is this file's main cost (#707); the default-state checks read
  // one shared, unmodified render.
  describe("in the default state", () => {
    let view: ReturnType<typeof renderToFragmentWithFeedback>;

    beforeAll(() => {
      userState.resetAll();
      view = renderToFragmentWithFeedback(AllPage, { props });
    });

    it("renders a section for every category, including recipes", () => {
      for (const key of CATEGORY_KEYS) {
        expect(view.container.querySelector(`#category-${key}`)).not.toBeNull();
      }
    });

    it("orders sections alphabetically by category name, matching the home page", () => {
      const expectedOrder = sortCategoryKeysByName(CATEGORY_KEYS, "en");
      const renderedOrder = [...view.container.querySelectorAll("[id^='category-']")].map(
        (element) => element.id.replace("category-", ""),
      );

      expect(renderedOrder).toEqual(expectedOrder);
    });

    it("reconciles the header total with every rendered category, recipes included", () => {
      const progress = getAllProgress(userState.progressContext);
      const overall = getOverallProgress(progress);
      expect(progress.recipes.total).toBeGreaterThan(0);

      expect(
        view.queries.getByText(
          `${formatNumber(overall.completed, "en")} of ${formatNumber(overall.total, "en")} completed`,
        ),
      ).toBeTruthy();
    });

    it("labels each section by its header and tints it with the category color", () => {
      for (const key of CATEGORY_KEYS) {
        const section = view.container.querySelector(`section[aria-labelledby="category-${key}"]`);
        expect(section, key).not.toBeNull();
        expect(section?.parentElement?.getAttribute("style"), key).toContain(
          `--primary: var(--color-category-${key})`,
        );
      }
    });
  });

  it("hides completed categories & respects a category URL override when showing them", () => {
    userState.setRenown(getMaxRenownLevel());

    const hidden = renderToFragmentWithFeedback(AllPage, { props });
    expect(hidden.container.querySelector("#category-renown")?.closest("section")?.hidden).toBe(
      true,
    );
    expect(hidden.container.querySelector("#category-skills")).not.toBeNull();

    userState.setEverythingGrouping("source");
    pageStub.navigate("/en/everything?group=category");
    userState.toggleShowCompleted();
    const shown = renderToFragmentWithFeedback(AllPage, { props });
    expect(shown.container.querySelector("#category-renown-completed")).not.toBeNull();
    expect(shown.container.querySelector("#sources-stores")).toBeNull();
    expect(userState.state.everythingGrouping).toBe("source");
  });
});
