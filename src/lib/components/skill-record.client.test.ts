import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import SkillRecordHarness from "#lib/components/skill-record.test-harness.svelte";
import { FeedbackContext } from "#lib/feedback/context.svelte.js";
import { userState } from "#lib/stores/user-state.svelte.js";

import type { SkillId } from "#lib/types/tracker-data.js";

const skillId = "mining" as SkillId;

describe("SkillRecord", () => {
  beforeEach(() => {
    userState.resetAll();
  });
  afterEach(() => {
    userState.resetAll();
  });

  it("registers with skill metadata", async () => {
    const feedbackContext = new FeedbackContext();
    const view = render(SkillRecordHarness, {
      feedbackContext,
      id: skillId,
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

    expect(
      screen.getByRole("button", { name: "Edit Mining level, currently 0 of 60" }),
    ).toBeInTheDocument();
    await fireEvent.click(
      screen.getByRole("button", { name: "Edit Mining level, currently 0 of 60" }),
    );
    expect(screen.getByRole("spinbutton", { name: "Mining level" })).toHaveValue(0);

    view.unmount();
    expect(feedbackContext.registrations.size).toBe(0);
  });

  it("renders four decorative fifteen-level segments and a spaced count", () => {
    userState.setSkillLevel(skillId, 22);
    const view = render(SkillRecordHarness, {
      feedbackContext: new FeedbackContext(),
      id: skillId,
      name: "Mining",
    });

    const segments = view.container.querySelectorAll("[data-skill-segment]");
    expect(segments).toHaveLength(4);
    expect(view.getByTestId("skill-segments")).toHaveAttribute("aria-hidden", "true");
    expect(segments[0].querySelector("i")).toHaveStyle("width: 100%");
    expect(segments[1].querySelector("i")).toHaveStyle("width: 46.666666666666664%");
    expect(segments[2].querySelector("i")).toHaveStyle("width: 0%");
    expect(view.getByText("22 / 60")).toBeInTheDocument();
    expect(view.getByRole("group", { name: "Mining level, 22 of 60" })).toBeInTheDocument();
  });

  it("commits finite direct edits and cancels invalid or escaped edits", async () => {
    const view = render(SkillRecordHarness, {
      feedbackContext: new FeedbackContext(),
      id: skillId,
      name: "Mining",
    });
    const editButton = () => view.getByRole("button", { name: /Edit Mining level, currently/ });

    await fireEvent.click(editButton());
    let input = view.getByRole("spinbutton", { name: "Mining level" });
    await fireEvent.input(input, { target: { value: "31" } });
    await fireEvent.keyDown(input, { key: "Enter" });
    expect(view.getByText("31 / 60")).toBeInTheDocument();

    await fireEvent.click(editButton());
    input = view.getByRole("spinbutton", { name: "Mining level" });
    await fireEvent.input(input, { target: { value: "not-a-number" } });
    await fireEvent.blur(input);
    expect(view.getByText("31 / 60")).toBeInTheDocument();

    await fireEvent.click(editButton());
    input = view.getByRole("spinbutton", { name: "Mining level" });
    await fireEvent.input(input, { target: { value: "55" } });
    await fireEvent.keyDown(input, { key: "Escape" });
    expect(view.getByText("31 / 60")).toBeInTheDocument();
  });

  it("keeps controls bounded and marks completion without color alone", async () => {
    const view = render(SkillRecordHarness, {
      compact: true,
      feedbackContext: new FeedbackContext(),
      id: skillId,
      name: "Mining",
    });
    expect(view.getByRole("button", { name: "Decrease Mining level" })).toBeDisabled();
    expect(view.container.querySelector("[data-skill-record]")).toHaveAttribute(
      "data-compact",
      "true",
    );

    userState.setSkillLevel(skillId, 60);
    await waitFor(() => {
      expect(view.getByRole("button", { name: "Increase Mining level" })).toBeDisabled();
    });
    expect(view.container.querySelector("[data-skill-record]")).toHaveAttribute(
      "data-complete",
      "true",
    );
    expect(view.getByTestId("skill-completion-mark")).toBeInTheDocument();
  });
});
