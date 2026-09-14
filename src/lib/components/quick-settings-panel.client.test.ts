import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import QuickSettingsPanel from "$lib/components/quick-settings-panel.svelte";
import { userState } from "$lib/stores/user-state.svelte.js";

afterEach(() => {
  userState.resetAll();
});

describe("QuickSettingsPanel", () => {
  it("returns the spoiler toggle to off when confirmation is canceled", async () => {
    render(QuickSettingsPanel);

    const spoilers = screen.getByRole("switch", { name: "Show spoilers?" });
    await fireEvent.click(spoilers);
    expect(await screen.findByRole("alertdialog")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Never mind" }));

    await waitFor(() => {
      expect(spoilers).not.toBeChecked();
    });
    expect(userState.state.showSpoilers).toBe(false);
  });
});
