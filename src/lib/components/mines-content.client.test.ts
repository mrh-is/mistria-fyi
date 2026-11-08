import { fireEvent, screen } from "@testing-library/svelte";
import { flushSync, tick } from "svelte";
import { beforeEach, describe, expect, it } from "vitest";

import MinesContent from "#lib/components/mines-content.svelte";
import { trackerData } from "#lib/data/index.js";
import { userState } from "#lib/stores/user-state.svelte.js";
import { renderWithFeedback } from "#lib/test-utils/render-with-feedback.js";

const waterQuest = trackerData.mines.seals[0].questId;

async function stepDown(): Promise<void> {
  await fireEvent.click(screen.getByRole("button", { name: "Go down one floor" }));
  await tick();
}

async function confirm(name: string): Promise<void> {
  await fireEvent.click(screen.getByRole("button", { name }));
  await tick();
}

describe("MinesContent floor stepper", () => {
  beforeEach(async () => {
    await userState.startTrackingByHand();
    renderWithFeedback(MinesContent, { compact: true, locale: "en" });
  });

  it("steps freely up to a seal", async () => {
    userState.setMineFloor(19);
    flushSync();
    await stepDown();

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(userState.state.progress.mineFloor).toBe(20);
  });

  it("asks before stepping past an unbroken seal, and cancelling changes nothing", async () => {
    userState.setMineFloor(20);
    flushSync();
    await stepDown();

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(userState.state.progress.mineFloor).toBe(20);
    await confirm("Never mind");
    expect(userState.state.progress.mineFloor).toBe(20);
  });

  it("records only the floor on “just this item”", async () => {
    userState.setMineFloor(20);
    flushSync();
    await stepDown();
    await confirm("Yes, but just this");

    expect(userState.state.progress.mineFloor).toBe(21);
    expect(userState.state.progress.questStates[waterQuest]).toBeUndefined();
  });

  it("records the seal's quest too on “update my progress”", async () => {
    userState.setMineFloor(20);
    flushSync();
    await stepDown();
    await confirm("Yes, and update my progress");

    expect(userState.state.progress.mineFloor).toBe(21);
    expect(userState.state.progress.questStates[waterQuest]).toBe("completed");
  });

  it("puts the field back when a typed jump past a seal is cancelled", async () => {
    const input = screen.getByRole<HTMLInputElement>("spinbutton");
    await fireEvent.change(input, { target: { value: "30" } });
    await tick();

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(input.value).toBe("0");
    await confirm("Never mind");
    expect(userState.state.progress.mineFloor).toBe(0);
  });
});
