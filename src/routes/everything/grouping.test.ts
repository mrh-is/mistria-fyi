import { beforeEach, expect, it } from "vitest";

import { pageMetadata } from "#lib/data/page-metadata.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderToFragmentWithFeedback } from "#lib/test-utils/render-to-fragment-with-feedback.js";

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

it("offers both grouping lenses and renders source anchors from the device preference", () => {
  userState.setEverythingGrouping("source");
  const view = renderToFragmentWithFeedback(AllPage, { props });
  expect(view.queries.getByLabelText("Group by")).toBeTruthy();
  expect(view.container.querySelector("#sources-stores")).not.toBeNull();
  expect(view.container.querySelector("#store-balor")).not.toBeNull();
  expect(view.container.querySelector("#fish-ocean")).not.toBeNull();
  expect(view.container.querySelector("#source-progress")).not.toBeNull();
  expect(view.container.querySelector("#category-almanac")).toBeNull();
});

it("lets the URL override the device preference without replacing it", () => {
  pageStub.navigate("/en/everything?group=source#store-balor");
  const sourceView = renderToFragmentWithFeedback(AllPage, { props });
  expect(sourceView.container.querySelector("#store-balor [data-tracker-row-list]")).not.toBeNull();
  expect(userState.state.everythingGrouping).toBe("category");
});
