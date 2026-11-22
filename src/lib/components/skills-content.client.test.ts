import { screen } from "@testing-library/svelte";
import { expect, it } from "vitest";

import SkillsContent from "#lib/components/skills-content.svelte";
import { trackerData } from "#lib/data/index.js";
import { getName } from "#lib/data/names.js";
import { MAX_SKILL_LEVEL } from "#lib/engine/progress.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";
import { recordKeys } from "#lib/utils/record.js";

import type { SkillId } from "#lib/types/tracker-data.js";

it("keeps all nine rulers in game order, including maxed skills", async () => {
  await userState.startTrackingByHand();
  userState.setSkillLevel("mining" as SkillId, MAX_SKILL_LEVEL);
  renderWithFeedback(SkillsContent, { locale: "en" });

  const names = recordKeys(trackerData.skills).map((id) => getName("skills", id, "en"));
  expect(names).toHaveLength(9);
  expect(
    screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
  ).toEqual(names);
  expect(screen.getAllByRole("slider")).toHaveLength(9);
  expect(screen.getByRole("link", { name: "Record perk purchases in Everything" })).toHaveAttribute(
    "href",
    "/en/everything#category-skills",
  );
  expect(screen.getByRole("slider", { name: "Mining level" })).toHaveAttribute(
    "aria-valuenow",
    "60",
  );
});
