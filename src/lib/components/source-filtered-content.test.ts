import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import CosmeticsContent from "$lib/components/cosmetics-content.svelte";
import { SOURCE_FILTERS } from "$lib/components/icon/index.js";
import { trackerData } from "$lib/data/index.js";
import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
import { userState } from "$lib/stores/user-state.svelte.js";

function renderedText(body: string): string {
  return body
    .replaceAll(/<!--.*?-->/gs, "")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

afterEach(() => {
  toolbarState.removeSourceFilters("test");
  userState.resetAll();
});

describe("source-filtered content", () => {
  it("keeps an empty cosmetic slot when every row is excluded by covered source groups", () => {
    const coveredTypes = new Set(SOURCE_FILTERS.flatMap(({ types }) => types));
    const cosmeticsBySlot = Object.groupBy(
      Object.values(trackerData.cosmetics),
      ({ slot }) => slot,
    );
    const coveredSlot = Object.entries(cosmeticsBySlot).find(([, cosmetics]) =>
      cosmetics.every(({ sources }) => sources.every(({ type }) => coveredTypes.has(type))),
    );
    if (!coveredSlot) throw new Error("Expected a cosmetic slot with covered source types");
    const slotLabel = coveredSlot[0].charAt(0).toUpperCase() + coveredSlot[0].slice(1);

    expect(renderedText(render(CosmeticsContent, { props: {} }).body)).toContain(slotLabel);

    toolbarState.setSourceFilters("test", SOURCE_FILTERS);
    toolbarState.hideAllSourceFilters();

    expect(renderedText(render(CosmeticsContent, { props: {} }).body)).toContain(
      `${slotLabel} 0/0`,
    );
  });
});
