import { tick } from "svelte";
import { expect, it } from "vitest";

import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import SourceContent from "./source-content.svelte";

it("keeps the Unobtainable display control available while the source lens renders almanac rows", async () => {
  expect(toolbarState.hasAlmanacFilters).toBe(false);
  const view = renderWithFeedback(SourceContent, { anchor: "", locale: "en" });
  await tick();
  expect(toolbarState.hasAlmanacFilters).toBe(true);
  view.unmount();
  await tick();
  expect(toolbarState.hasAlmanacFilters).toBe(false);
});
