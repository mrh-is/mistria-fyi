import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";

import DangerZoneCard from "./danger-zone-card.svelte";

afterEach(async () => {
  cleanup();
  userState.resetAll();
  await new Promise((resolve) => setTimeout(resolve, 100));
});

describe("DangerZoneCard", () => {
  it("asks for confirmation before resetting and keeps progress when cancelled", async () => {
    userState.toggleShowSpoilers();
    render(DangerZoneCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Reset all progress" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Reset all progress?" });
    expect(dialog).toHaveTextContent("This cannot be undone.");
    expect(userState.state.showSpoilers).toBe(true);

    await fireEvent.click(within(dialog).getByRole("button", { name: "Never mind" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(userState.state.showSpoilers).toBe(true);
  });

  it("resets all progress once confirmed and closes the dialog", async () => {
    userState.toggleShowSpoilers();
    render(DangerZoneCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Reset all progress" }));
    const dialog = await screen.findByRole("alertdialog");

    await fireEvent.click(within(dialog).getByRole("button", { name: "Yes, reset everything" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(userState.state.showSpoilers).toBe(false);
  });
});
