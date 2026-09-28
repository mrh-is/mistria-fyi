import { render } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VillagerRoster from "$lib/components/villager-roster.svelte";
import { trackerData } from "$lib/data/index.js";
import { getName, nameCollator } from "$lib/data/names.js";
import { MAX_VILLAGER_LEVEL } from "$lib/engine/progress";
import { userState } from "$lib/stores/user-state.svelte.js";
import { pageStub } from "$lib/test-utils/page-stub.svelte";
import { recordKeys } from "$lib/utils.js";

import type { LocaleCode } from "$lib/types/locale.js";

vi.mock("$app/state", async () => ({
  page: (await import("$lib/test-utils/page-stub.svelte")).pageStub,
}));

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

describe("VillagerRoster with completed villagers hidden", () => {
  const [completed, other] = recordKeys(trackerData.villagers).filter(
    (id) => !trackerData.villagers[id].dateable,
  );

  beforeEach(() => {
    userState.resetAll();
    if (userState.state.showCompleted) userState.toggleShowCompleted();
    userState.setVillagerLevel(completed, MAX_VILLAGER_LEVEL);
    userState.setVillagerLevel(other, MAX_VILLAGER_LEVEL);
  });

  afterEach(() => {
    userState.resetAll();
    pageStub.reset();
  });

  it("hides completed villagers", () => {
    const view = render(VillagerRoster, { locale: "en" });

    expect(view.container.querySelector(`#villager-${completed}`)).toBeNull();
  });

  it("keeps the villager targeted by the URL hash", () => {
    pageStub.navigate(`/en/villagers#villager-${completed}`);

    const view = render(VillagerRoster, { locale: "en" });

    expect(view.container.querySelector(`#villager-${completed}`)).not.toBeNull();
    expect(view.container.querySelector(`#villager-${other}`)).toBeNull();
  });
});
