import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import WelcomeCard from "#lib/components/welcome-card.svelte";
import { userState } from "#lib/stores/user-state.svelte.js";

beforeEach(() => {
  userState.loadFromStorage();
  userState.resetAll();
});

afterEach(async () => {
  cleanup();
  await tick();
});

describe("WelcomeCard", () => {
  it("asks how to work, with sync or by hand", async () => {
    render(WelcomeCard);

    expect(screen.getByRole("heading", { name: "Ready to get started?" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Sync from my farm automagically/ }).getAttribute("href"),
    ).toMatch(/\/sync$/);

    await fireEvent.click(screen.getByRole("button", { name: /I’ll track it all by hand/ }));

    await waitFor(() => {
      expect(userState.trackingLane).toBe("manual");
      expect(userState.hasAnyProgress).toBe(true);
    });
  });

  it("accepts copy for a required tracking choice", () => {
    render(WelcomeCard, { body: "Choose before checking off.", title: "Choose how to track" });
    expect(screen.getByRole("heading", { name: "Choose how to track" })).toBeVisible();
    expect(screen.getByText("Choose before checking off.")).toBeVisible();
  });
});
