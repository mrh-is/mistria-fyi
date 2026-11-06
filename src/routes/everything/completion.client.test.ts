import { fireEvent, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, expect, it, vi } from "vitest";

import { pageMetadata } from "#lib/data/page-metadata.js";
import { getMaxRenownLevel } from "#lib/engine/progress.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
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

beforeEach(async () => {
  await userState.startTrackingByHand();
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

it("offers one closed Completed fold, only once something's finished", async () => {
  const view = renderWithFeedback(AllPage, props);
  await tick();
  expect(view.queryByTestId("everything-completed")).toBeNull();

  userState.setRenown(getMaxRenownLevel());
  await vi.advanceTimersByTimeAsync(ROW_LEAVE_MS);
  await tick();

  const completed = view.getByTestId("everything-completed");
  const fold = within(completed).getByRole("button", { expanded: false, name: "Completed" });
  expect(within(completed).queryByRole("button", { name: "Renown" })).toBeNull();

  await fireEvent.click(fold);
  expect(within(completed).getByRole("button", { name: "Renown" })).toBeInTheDocument();
});

it("opens the Completed fold for a search, then closes it again", async () => {
  userState.setRenown(getMaxRenownLevel());
  const view = renderWithFeedback(AllPage, props);
  await tick();
  const completed = view.getByTestId("everything-completed");
  expect(within(completed).getByRole("button", { name: "Completed" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  toolbarState.setSearchQuery("restore");
  await tick();
  expect(within(completed).getByRole("button", { name: "Completed" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  toolbarState.setSearchQuery("");
  await tick();
  expect(within(completed).getByRole("button", { name: "Completed" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
});
