import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import SkillPerks from "#lib/components/skill-perks.svelte";
import { createSpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { perkUnlocksFor } from "#lib/engine/perk-unlocks.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { recordKeys } from "#lib/utils/record.js";

import type { SpoilerGuard } from "#lib/controllers/spoiler-guard.svelte.js";
import type { PerkId, SkillId } from "#lib/types/tracker-data.js";

const skillId = "mining" as SkillId;
const tiers = trackerData.skills[skillId].perkTiers.map((tier) => recordKeys(tier));
const total = tiers.flat().length;
const firstPerk = tiers[0][0];
const firstPerkName = getName("perks", firstPerk, "en");
const lockedPerk = tiers[2][0];
const lockedPerkName = getName("perks", lockedPerk, "en");
/** Perks in tiers 1 & 2, the ones a player at the tier-2 gate can have. */
const reachedCount = tiers[0].length + tiers[1].length;
const tier2Level = trackerData.perkTierLevels[1];

let spoilerGuard: SpoilerGuard;

function renderPerks(locale: "en" | "ja" = "en") {
  return render(SkillPerks, { id: skillId, locale, name: "Mining", spoilerGuard });
}

function toggle() {
  return screen.getByRole("button", { name: /^Mining perks, / });
}

describe("SkillPerks", () => {
  beforeEach(() => {
    userState.resetAll();
    spoilerGuard = createSpoilerGuard();
  });
  afterEach(() => {
    cleanup();
    userState.resetAll();
  });

  it("starts collapsed, counting every perk as locked before level 1", () => {
    renderPerks();

    const button = screen.getByRole("button", { name: `Mining perks, ${String(total)} locked` });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveTextContent(`Perks ${String(total)} locked`);
    expect(screen.queryByRole("button", { name: `Check ${firstPerkName}` })).toBeNull();
  });

  it("counts perks in reached tiers as unlockable & the rest as locked", () => {
    userState.setSkillLevel(skillId, tier2Level);
    userState.togglePerk(firstPerk);
    renderPerks();

    const locked = total - reachedCount;
    expect(toggle()).toHaveAccessibleName(
      `Mining perks, 1 of ${String(reachedCount)} unlocked, ${String(locked)} more locked`,
    );
    expect(toggle()).toHaveTextContent(
      `Perks 1 / ${String(reachedCount)} unlocked ${String(locked)} more locked`,
    );
  });

  it("drops the locked count once every tier is reached", () => {
    userState.setSkillLevel(skillId, 60);
    renderPerks();

    expect(toggle()).toHaveAccessibleName(`Mining perks, 0 of ${String(total)} unlocked`);
  });

  it("lists every tier with its number, level & localized perk names", async () => {
    userState.setSkillLevel(skillId, 60);
    renderPerks();
    await fireEvent.click(toggle());

    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(toggle()).toHaveAttribute("aria-controls", expect.any(String));
    for (const [index, level] of trackerData.perkTierLevels.entries()) {
      const tier = screen.getByRole("list", {
        name: `Mining perks, Tier ${String(index + 1)}, level ${String(level)}`,
      });
      expect(tier.closest("[data-perk-tier]")).toHaveTextContent(
        new RegExp(`^Tier ${String(index + 1)} Level ${String(level)} `),
      );
      const names = [...tier.querySelectorAll(".skill-perks__perk-name")].map((name) =>
        name.textContent.trim(),
      );
      expect(names).toEqual(tiers[index].map((perk) => getName("perks", perk, "en")));
    }
  });

  it("checks a perk off & unchecks it again", async () => {
    userState.setSkillLevel(skillId, 60);
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
  });

  it("collapses again", async () => {
    renderPerks();

    await fireEvent.click(toggle());
    expect(screen.getAllByRole("list").length).toBeGreaterThan(0);
    await fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(screen.queryAllByRole("list")).toHaveLength(0);
    });
  });

  it("spoilers perks in unreached tiers & guards checking them", async () => {
    userState.setSkillLevel(skillId, tier2Level);
    const view = renderPerks();
    await fireEvent.click(toggle());

    const reached = [...view.container.querySelectorAll<HTMLElement>("[data-perk-tier]")].map(
      (tier) => tier.dataset.reached,
    );
    expect(reached).toEqual(["true", "true", "false", "false", "false"]);
    expect(screen.queryByRole("button", { name: `Check ${lockedPerkName}` })).toBeNull();

    const tier3 = screen.getByRole("list", { name: /Tier 3,/ });
    await fireEvent.click(
      within(tier3).getAllByRole("button", { name: "Check spoilered item" })[0],
    );
    expect(spoilerGuard.open).toBe(true);
    expect(spoilerGuard.condition).toEqual({
      type: "skillLevel",
      level: trackerData.perkTierLevels[2],
      skillId,
    });
    expect(userState.state.progress.unlockedPerks.has(lockedPerk)).toBe(false);

    spoilerGuard.proceed();
    expect(userState.state.progress.unlockedPerks.has(lockedPerk)).toBe(true);
    expect(await screen.findByRole("button", { name: `Uncheck ${lockedPerkName}` })).toBeVisible();
  });

  it("reveals a spoilered name without unlocking the perk", async () => {
    renderPerks();
    await fireEvent.click(toggle());

    await fireEvent.click(screen.getAllByRole("button", { name: "Reveal spoiler" })[0]);
    expect(await screen.findByText(firstPerkName)).toBeInTheDocument();
    expect(userState.state.progress.unlockedPerks.has(firstPerk)).toBe(false);
  });

  it("shows every name unguarded with spoilers on", async () => {
    userState.toggleShowSpoilers();
    renderPerks();
    await fireEvent.click(toggle());

    expect(screen.queryByRole("button", { name: "Reveal spoiler" })).toBeNull();
    await fireEvent.click(screen.getByRole("button", { name: `Check ${lockedPerkName}` }));
    expect(spoilerGuard.open).toBe(false);
    expect(userState.state.progress.unlockedPerks.has(lockedPerk)).toBe(true);
  });

  it("renders perk names in the active locale", async () => {
    userState.setSkillLevel(skillId, 60);
    renderPerks("ja");
    await fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByText(getName("perks", firstPerk, "ja"))).toBeInTheDocument();
  });

  describe("unlock notes", () => {
    const archaeology = "archaeology" as SkillId;
    const linkedPerk = "natural_beauty" as PerkId;
    const linkedUnlocks = perkUnlocksFor(linkedPerk);
    const linkedName = getName("perks", linkedPerk, "en");

    function renderArchaeology() {
      return render(SkillPerks, {
        id: archaeology,
        locale: "en",
        name: "Archaeology",
        spoilerGuard,
      });
    }

    it("notes how many recipes a perk unlocks, as text rather than a link", async () => {
      userState.setSkillLevel(archaeology, 60);
      renderArchaeology();
      await fireEvent.click(screen.getByRole("button", { name: /^Archaeology perks, / }));

      expect(linkedUnlocks?.recipes.length).toBeGreaterThan(1);
      const note = screen.getByText(`unlocks ${String(linkedUnlocks?.recipes.length)} recipes`);
      expect(note.closest("a")).toBeNull();
      expect(note.closest("li")).toHaveTextContent(linkedName);
      expect(screen.queryByRole("link", { name: /^unlocks / })).toBeNull();
    });

    it("annotates only perks whose sources link to something", async () => {
      userState.setSkillLevel(archaeology, 60);
      renderArchaeology();
      await fireEvent.click(screen.getByRole("button", { name: /^Archaeology perks, / }));

      const annotated = [...document.querySelectorAll(".skill-perks__perk")].filter(
        (item) => item.querySelector(".skill-perks__unlocks") !== null,
      );
      const expected = trackerData.skills[archaeology].perkTiers
        .flatMap((tier) => recordKeys(tier))
        .filter((perkId) => perkUnlocksFor(perkId) !== undefined);
      expect(annotated).toHaveLength(expected.length);
      expect(annotated.length).toBeLessThan(
        trackerData.skills[archaeology].perkTiers.flatMap((tier) => recordKeys(tier)).length,
      );
    });

    it("keeps the note hidden until a spoilered perk is revealed", async () => {
      renderArchaeology();
      await fireEvent.click(screen.getByRole("button", { name: /^Archaeology perks, / }));

      expect(document.querySelectorAll(".skill-perks__unlocks")).toHaveLength(0);
      const tier3 = screen.getByRole("list", { name: /Tier 3,/ });
      const revealButtons = within(tier3).getAllByRole("button", { name: "Reveal spoiler" });
      await Promise.all(revealButtons.map((button) => fireEvent.click(button)));
      expect(await screen.findByText(/^unlocks \d+ recipes$/)).toBeVisible();
    });

    it("notes a perk's almanac & cosmetics unlocks separately", async () => {
      userState.toggleShowSpoilers();
      renderArchaeology();
      await fireEvent.click(screen.getByRole("button", { name: /^Archaeology perks, / }));

      expect(screen.getByText(/^unlocks \d+ almanac items?$/)).toBeVisible();
      expect(screen.getByText(/^unlocks \d+ cosmetics?$/)).toBeVisible();
    });
  });
});
