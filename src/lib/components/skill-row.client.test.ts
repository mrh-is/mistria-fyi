import { render, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import SkillRowHarness from "$lib/components/skill-row.test-harness.svelte";
import { FeedbackContext } from "$lib/feedback/context.svelte.js";

import type { SkillId } from "$lib/types/tracker-data.js";

describe("SkillRow reportable registration", () => {
  it("registers with skill metadata", async () => {
    const feedbackContext = new FeedbackContext();
    const view = render(SkillRowHarness, {
      feedbackContext,
      id: "mining" as SkillId,
      name: "Mining",
    });

    await waitFor(() => {
      expect(feedbackContext.registrations.size).toBe(1);
    });
    const registration = [...feedbackContext.registrations.values()][0];
    expect(registration).toMatchObject({
      category: "skill",
      displayName: "Mining",
      entityId: "mining",
    });
    expect(registration.extra).toHaveProperty("level");

    view.unmount();
    expect(feedbackContext.registrations.size).toBe(0);
  });
});
