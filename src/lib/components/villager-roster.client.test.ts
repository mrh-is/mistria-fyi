import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VillagerRoster from "#lib/components/villager-roster.svelte";
import { trackerData } from "#lib/data/index.js";
import { MAX_VILLAGER_LEVEL } from "#lib/engine/progress.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { recordKeys } from "#lib/utils/record.js";

vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));

describe("VillagerRoster localization", () => {
  beforeEach(() => {
    userState.resetAll();
  });

  afterEach(() => {
    userState.resetAll();
  });

  it("renders English names under the en locale", () => {
    const view = renderWithFeedback(VillagerRoster, { locale: "en" });

    expect(view.getByText("Balor")).toBeInTheDocument();
    expect(view.getByText("Adeline")).toBeInTheDocument();
  });

  it("renders localized names under a non-Latin locale", () => {
    const view = renderWithFeedback(VillagerRoster, { locale: "ja" });

    expect(view.getByText("バロル")).toBeInTheDocument();
    expect(view.getByText("アデライン")).toBeInTheDocument();
    expect(view.queryByText("Balor")).not.toBeInTheDocument();
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

  it("keeps the villager targeted by the URL hash", () => {
    pageStub.navigate(`/en/villagers#villager-${completed}`);

    const view = renderWithFeedback(VillagerRoster, { locale: "en" });

    expect(view.container.querySelector(`#villager-${completed}`)).not.toBeNull();
    expect(view.container.querySelector(`#villager-${other}`)).toBeNull();
  });
});
