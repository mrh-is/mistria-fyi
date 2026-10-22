import { fireEvent, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, it } from "vitest";

import MountAppearancesSection from "#lib/components/mount-appearances-section.svelte";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { recordKeys } from "#lib/utils/record.js";

import type { PerkId } from "#lib/types/tracker-data.js";

// No test finishes the section, so none fires the confetti that happy-dom can't draw.
const horsepower = "horsepower" as PerkId;

async function openMountSection(): Promise<void> {
  renderWithFeedback(MountAppearancesSection, {
    areAllAnimalsComplete: () => false,
    locale: "en",
  });
  const mountName = new RegExp(`^${RegExp.escape(getName("ui", "mount", "en"))},`);
  await fireEvent.click(await screen.findByRole("button", { name: mountName }));
}

beforeEach(() => {
  userState.resetAll();
  toolbarState.closeSearch();
  userState.toggleShowSpoilers();
});

describe("MountAppearancesSection", () => {
  it("lists every Mistmare perk beside the appearances, counted in the section total", async () => {
    await openMountSection();
    const total =
      recordKeys(trackerData.mount.appearances).length + recordKeys(trackerData.mount.perks).length;

    expect(
      screen.getByRole("button", {
        name: `${getName("ui", "mount", "en")}, 0 of ${total} completed`,
      }),
    ).toHaveAttribute("aria-expanded", "true");
    for (const id of recordKeys(trackerData.mount.perks)) {
      expect(
        screen.getByRole("button", { name: `Check ${getName("perks", id, "en")}` }),
      ).toBeTruthy();
    }
  });

  it("checks a perk into unlockedPerks, then unchecks it", async () => {
    userState.toggleShowCompleted();
    await openMountSection();
    const name = getName("perks", horsepower, "en");

    await fireEvent.click(screen.getByRole("button", { name: `Check ${name}` }));
    expect(userState.state.progress.unlockedPerks.has(horsepower)).toBe(true);

    await fireEvent.click(await screen.findByRole("button", { name: `Uncheck ${name}` }));
    expect(userState.state.progress.unlockedPerks.has(horsepower)).toBe(false);
  });
});
