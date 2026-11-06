import { cleanup, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import SkillsContent from "#lib/components/skills-content.svelte";
import { MAX_SKILL_LEVEL } from "#lib/engine/progress.js";
import { perksOfSkill } from "#lib/engine/projections/skills.js";
import { toolbarState } from "#lib/stores/toolbar-state.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

import type { SkillId } from "#lib/types/tracker-data.js";

const skillId = "mining" as SkillId;

function miningRecord() {
  return screen.queryByRole("button", { name: /^Edit Mining level/ });
}

describe("SkillsContent", () => {
  beforeEach(async () => {
    toolbarState.closeSearch();
    userState.resetAll();
    await userState.startTrackingByHand();
  });
  afterEach(() => {
    cleanup();
    userState.resetAll();
  });

  it("keeps a maxed skill visible until every perk is bought", () => {
    renderWithFeedback(SkillsContent, { locale: "en" });
    const [lastPerk, ...otherPerks] = perksOfSkill(skillId).toReversed();

    userState.setSkillLevel(skillId, MAX_SKILL_LEVEL);
    for (const perkId of otherPerks) userState.togglePerk(perkId);
    flushSync();
    expect(miningRecord()).not.toBeNull();

    // A finished skill moves into the closed Completed fold.
    userState.togglePerk(lastPerk);
    flushSync();
    expect(miningRecord()).toBeNull();
    expect(screen.getByRole("button", { expanded: false, name: "Completed" })).toBeInTheDocument();
  });
});
