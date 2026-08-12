import { render } from "svelte/server";
import { afterEach, describe, expect, it } from "vitest";

import AlmanacContent from "$lib/components/almanac-content.svelte";
import MinesContent from "$lib/components/mines-content.svelte";
import { trackerData } from "$lib/data/index.js";
import { toolbarState } from "$lib/stores/toolbar-state.svelte.js";
import { userState } from "$lib/stores/user-state.svelte.js";

import type { ItemId, SpellId } from "$lib/types/tracker-data.js";

function renderedText(body: string): string {
  return body
    .replaceAll(/<!--.*?-->/gs, "")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

afterEach(() => {
  userState.resetAll();
  toolbarState.closeSearch();
});

describe("subsection counters", () => {
  it("counts completed spells when completed rows are hidden", () => {
    const spellIds = Object.keys(trackerData.mines.spells) as SpellId[];
    userState.toggleSpell(spellIds[0]);

    const { body } = render(MinesContent, { props: {} });

    expect(renderedText(body)).toContain(`Spells 1/${spellIds.length}`);
  });

  it("hides the spells section when every spell row is hidden", () => {
    for (const spellId of Object.keys(trackerData.mines.spells) as SpellId[]) {
      userState.toggleSpell(spellId);
    }

    const { body } = render(MinesContent, { props: {} });

    expect(renderedText(body)).not.toContain("Spells");
  });

  it("limits almanac counters to the search scope", () => {
    userState.toggleAlmanacItem("axe_copper" as ItemId);
    userState.toggleAlmanacItem("copper_armor" as ItemId);
    userState.toggleShowCompleted();
    toolbarState.setSearch("Copper Axe");

    const { body } = render(AlmanacContent, { props: {} });

    expect(renderedText(body)).toContain("Blacksmithing 1/1");
  });
});
