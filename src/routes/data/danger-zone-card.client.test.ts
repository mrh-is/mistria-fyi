import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { userState } from "#lib/stores/user-state.svelte.js";
import { enableSpoilers } from "#lib/test-utils/spoilers.js";

import DangerZoneCard from "./danger-zone-card.svelte";

// Client files share one store per worker, so each test starts from defaults (#174).
beforeEach(async () => {
  userState.resetAll();
  await tick();
});

afterEach(async () => {
  cleanup();
  userState.resetAll();
  await tick();
});

describe("DangerZoneCard", () => {
  it("asks for confirmation before resetting and keeps progress when cancelled", async () => {
    enableSpoilers();
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
    userState.setRenown(7);
    enableSpoilers();
    render(DangerZoneCard, { open: true });

    await fireEvent.click(screen.getByRole("button", { name: "Reset all progress" }));
    const dialog = await screen.findByRole("alertdialog");

    await fireEvent.click(within(dialog).getByRole("button", { name: "Yes, reset everything" }));

    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(userState.state.progress.renown).toBe(0);
    // Preferences belong to the device, not the progress being reset.
    expect(userState.state.showSpoilers).toBe(true);
  });
});
