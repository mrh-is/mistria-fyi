import { tick } from "svelte";
import { afterEach, expect, it } from "vitest";

import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { AVAILABILITY_WINDOWS } from "#lib/types/availability.js";

import SourceContent from "./source-content.svelte";

afterEach(() => {
  toolbarState.closeSearch();
  userState.resetAll();
});

it("names the Almanac variant in the source view’s checkbox label", async () => {
  userState.resetAll();
  userState.toggleShowSpoilers();
  userState.setAvailabilityWindows(AVAILABILITY_WINDOWS);
  toolbarState.setSearchQuery("oak window");
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });

  const buttons = await view.findAllByRole("button", { name: "Check Animated Clouds Window, Oak" });
  expect(buttons.length).toBeGreaterThan(0);
  expect(view.queryByRole("button", { name: "Check Animated Clouds Window" })).toBeNull();
});

it("keeps the Unobtainable display control available while the source lens renders almanac rows", async () => {
  expect(toolbarState.hasAlmanacFilters).toBe(false);
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  await tick();
  expect(toolbarState.hasAlmanacFilters).toBe(true);
  view.unmount();
  await tick();
  expect(toolbarState.hasAlmanacFilters).toBe(false);
});
