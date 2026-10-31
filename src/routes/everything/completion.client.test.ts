import { within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { pageMetadata } from "#lib/data/page-metadata.js";
import { getMaxRenownLevel } from "#lib/engine/progress.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { ROW_LEAVE_MS } from "#lib/utils/row-timing.js";

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
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

it("shows one fixed Completed divider, only once a completed group has content", async () => {
  userState.toggleShowCompleted();
  const view = renderWithFeedback(AllPage, props);
  await tick();
  const completed = view.getByTestId("everything-completed");
  expect(completed.hidden).toBe(true);
  userState.setRenown(getMaxRenownLevel());
  await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS);
  await tick();
  expect(completed.hidden).toBe(false);
  expect(within(completed).getByRole("heading", { name: "Completed" })).toBeInTheDocument();
  expect(within(completed).queryByRole("button", { name: "Completed" })).not.toBeInTheDocument();
});
