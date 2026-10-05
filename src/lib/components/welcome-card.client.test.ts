import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import WelcomeCard from "#lib/components/welcome-card.svelte";
import { userState } from "#lib/stores/user-state.svelte.js";

function setDevice({ touchPoints, width }: { touchPoints: number; width: number }): void {
  Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: touchPoints });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
}

beforeEach(() => {
  userState.resetAll();
  setDevice({ touchPoints: 0, width: 1280 });
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await new Promise((resolve) => setTimeout(resolve, 350));
});

describe("WelcomeCard", () => {
  it("offers save import first on a desktop and starts manual tracking with default items", async () => {
    render(WelcomeCard);

    expect(
      screen.getByRole("link", { name: "Import from save file" }).getAttribute("href"),
    ).toMatch(/\/data\?section=import$/);

    await fireEvent.click(screen.getByRole("button", { name: "Start tracking manually" }));

    expect(userState.hasAnyProgress).toBe(true);
    expect(screen.queryByRole("region", { name: "Getting started" })).toBeNull();
  });

  it("offers device transfer first on touch devices and lets users correct the detection", async () => {
    setDevice({ touchPoints: 5, width: 390 });
    render(WelcomeCard);

    expect(
      (await screen.findByRole("link", { name: "Scan QR code from another device" })).getAttribute(
        "href",
      ),
    ).toMatch(/\/data\?section=transfer$/);

    await fireEvent.click(screen.getByRole("button", { name: "I’m on a computer" }));

    expect(screen.getByRole("link", { name: "Import from save file" })).toBeVisible();
    expect(screen.getByRole("button", { name: "I want to scan a QR code instead" })).toBeVisible();
  });

  it("returns after a full reset leaves no tracked progress", async () => {
    render(WelcomeCard);
    await fireEvent.click(screen.getByRole("button", { name: "Start tracking manually" }));

    userState.resetAll();

    await waitFor(() => {
      expect(screen.getByRole("region", { name: "Getting started" })).toBeVisible();
    });
    expect(userState.hasAnyProgress).toBe(false);
  });
});
