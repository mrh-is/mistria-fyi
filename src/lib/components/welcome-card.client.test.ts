import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import WelcomeCard from "#lib/components/welcome-card.svelte";
import { userState } from "#lib/stores/user-state.svelte.js";

describe("WelcomeCard", () => {
  it("asks how to work, with sync or by hand", async () => {
    render(WelcomeCard);

    expect(screen.getByRole("heading", { name: "Ready to get started?" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: /Sync from my farm automagically/ }).getAttribute("href"),
    ).toMatch(/\/sync$/);

    await fireEvent.click(screen.getByRole("button", { name: /I’ll track it all by hand/ }));

    expect(userState.hasAnyProgress).toBe(true);
    expect(screen.queryByRole("region", { name: "Getting started" })).toBeNull();
  });

  it("returns after a full reset leaves no tracked progress", async () => {
    render(WelcomeCard);
    await fireEvent.click(screen.getByRole("button", { name: /I’ll track it all by hand/ }));

    userState.resetAll();

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Getting started" })).toBeVisible();
    });
    expect(userState.hasAnyProgress).toBe(false);
  });
});
