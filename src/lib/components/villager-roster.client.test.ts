import { render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import VillagerRoster from "$lib/components/villager-roster.svelte";
import { trackerData } from "$lib/data/index.js";
import { getName, nameCollator } from "$lib/data/names.js";
import { userState } from "$lib/stores/user-state.svelte.js";
import { recordKeys } from "$lib/utils.js";

import type { LocaleCode } from "$lib/types/locale.js";

function rosterNames(locale: LocaleCode): string[] {
  return recordKeys(trackerData.villagers)
    .map((id) => getName("villagers", id, locale))
    .sort((a, b) => nameCollator(locale).compare(a, b));
}

describe("VillagerRoster localization", () => {
  beforeEach(() => {
    userState.resetAll();
  });

  afterEach(() => {
    userState.resetAll();
  });

  it("renders English names under the en locale", () => {
    const view = render(VillagerRoster, { locale: "en" });

    expect(view.getByText("Balor")).toBeInTheDocument();
    expect(view.getByText("Adeline")).toBeInTheDocument();
  });

  it("renders localized names under a non-Latin locale", () => {
    const view = render(VillagerRoster, { locale: "ja" });

    expect(view.getByText("バロル")).toBeInTheDocument();
    expect(view.getByText("アデライン")).toBeInTheDocument();
    expect(view.queryByText("Balor")).not.toBeInTheDocument();
  });

  it("orders the roster with the active locale's collation", () => {
    for (const locale of ["en", "ja"] as const) {
      const view = render(VillagerRoster, { locale });
      const rendered = [...view.container.querySelectorAll("[data-villager-name]")].map((element) =>
        element.textContent.trim(),
      );
      expect(rendered).toStrictEqual(rosterNames(locale));
      view.unmount();
    }
  });
});
