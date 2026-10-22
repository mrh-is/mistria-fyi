import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import SkillPerks from "#lib/components/skill-perks.svelte";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordKeys } from "#lib/utils/record.js";

import type { SkillId } from "#lib/types/tracker-data.js";

const skillId = "mining" as SkillId;
const tiers = trackerData.skills[skillId].perkTiers.map((tier) => recordKeys(tier));
const total = tiers.flat().length;
const firstPerk = tiers[0][0];
const firstPerkName = getName("perks", firstPerk, "en");

function renderPerks(locale: "en" | "ja" = "en") {
  return render(SkillPerks, { id: skillId, locale, name: "Mining" });
}

function toggle() {
  return screen.getByRole("button", { name: /^Mining perks, \d+ of \d+ unlocked$/ });
}

describe("SkillPerks", () => {
  beforeEach(() => {
    userState.resetAll();
  });
  afterEach(() => {
    cleanup();
    userState.resetAll();
  });

  it("starts collapsed with an unlocked count", () => {
    renderPerks();

    const button = screen.getByRole("button", {
      name: `Mining perks, 0 of ${String(total)} unlocked`,
    });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveTextContent(`Perks 0 / ${String(total)}`);
    expect(screen.queryByRole("button", { name: `Check ${firstPerkName}` })).toBeNull();
  });

  it("lists every tier with its level requirement & localized perk names", async () => {
    renderPerks();
    await fireEvent.click(toggle());

    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(toggle()).toHaveAttribute("aria-controls", expect.any(String));
    for (const [index, level] of trackerData.perkTierLevels.entries()) {
      const tier = screen.getByRole("list", {
        name: `Mining perks at level ${String(level)}`,
      });
      expect(tier.closest("[data-perk-tier]")).toHaveTextContent(`Level ${String(level)}`);
      const names = within(tier)
        .getAllByRole("listitem")
        .map((item) => item.textContent.trim());
      expect(names).toEqual(tiers[index].map((perk) => getName("perks", perk, "en")));
    }
  });

  it("checks a perk off & unchecks it again", async () => {
    renderPerks();
    await fireEvent.click(toggle());

    await fireEvent.click(screen.getByRole("button", { name: `Check ${firstPerkName}` }));
    expect(userState.state.progress.unlockedPerks.has(firstPerk)).toBe(true);
    expect(toggle()).toHaveAccessibleName(`Mining perks, 1 of ${String(total)} unlocked`);
    expect(screen.getByRole("button", { name: `Uncheck ${firstPerkName}` })).toHaveClass(
      "tracker-checkbox--checked",
    );

    await fireEvent.click(screen.getByRole("button", { name: `Uncheck ${firstPerkName}` }));
    expect(userState.state.progress.unlockedPerks.has(firstPerk)).toBe(false);
    expect(toggle()).toHaveAccessibleName(`Mining perks, 0 of ${String(total)} unlocked`);
  });

  it("collapses again & reflects perks unlocked elsewhere", async () => {
    userState.togglePerk(firstPerk);
    renderPerks();

    expect(toggle()).toHaveAccessibleName(`Mining perks, 1 of ${String(total)} unlocked`);
    await fireEvent.click(toggle());
    expect(screen.getByRole("button", { name: `Uncheck ${firstPerkName}` })).toBeInTheDocument();
    await fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: `Uncheck ${firstPerkName}` })).toBeNull();
  });

  it("marks tiers above the tracked skill level as not yet reached", async () => {
    userState.setSkillLevel(skillId, trackerData.perkTierLevels[1]);
    const view = renderPerks();
    await fireEvent.click(toggle());

    const reached = [...view.container.querySelectorAll<HTMLElement>("[data-perk-tier]")].map(
      (tier) => tier.dataset.reached,
    );
    expect(reached).toEqual(["true", "true", "false", "false", "false"]);
  });

  it("renders perk names in the active locale", async () => {
    renderPerks("ja");
    await fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByText(getName("perks", firstPerk, "ja"))).toBeInTheDocument();
  });
});
