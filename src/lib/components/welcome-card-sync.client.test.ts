import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import WelcomeCard from "#lib/components/welcome-card.svelte";
import { userState } from "#lib/stores/user-state.svelte.js";
import { syncEnabled } from "#lib/sync/enabled.js";

beforeEach(() => {
  userState.resetAll();
});

afterEach(async () => {
  cleanup();
  await tick();
});

describe("WelcomeCard with sync", () => {
  it("is on in tests, as on branch previews & in dev", () => {
    expect(syncEnabled).toBe(true);
  });

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
});
