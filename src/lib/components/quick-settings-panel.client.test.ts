import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { tick } from "svelte";
import { afterEach, describe, expect, it } from "vitest";

import QuickSettingsPanel from "#lib/components/quick-settings-panel.svelte";
import { userState } from "#lib/stores/user-state.svelte.js";

afterEach(async () => {
  userState.resetAll();
  cleanup();
  await tick();
});

describe("QuickSettingsPanel", () => {
  it("groups compact links to the data and About pages", () => {
    const { container } = render(QuickSettingsPanel);

    expect(screen.getByRole("link", { name: "Data" })).toHaveAttribute("href", "/en/data");
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/en/about");
    expect(container.querySelector(".quick-settings__links")?.children).toHaveLength(2);
  });

  it("lists every shipped language by its native name, with beta translations marked", async () => {
    render(QuickSettingsPanel);

    await fireEvent.click(screen.getByRole("button", { name: "Choose language" }));

    expect(screen.getByRole("button", { name: "Choose language" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "日本語 Beta translation" })).toBeVisible();
    expect(screen.getByRole("button", { name: "简体中文 Beta translation" })).toBeVisible();
    expect(screen.getByRole("button", { name: "繁體中文 Beta translation" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Español Beta translation" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Français Beta translation" })).toBeVisible();
    expect(screen.getByRole("button", { name: "한국어 Beta translation" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Русский Beta translation" })).toBeVisible();
  });

  it("returns the spoiler toggle to off when confirmation is canceled", async () => {
    render(QuickSettingsPanel);

    const spoilers = screen.getByRole("switch", { name: "Show spoilers?" });
    await fireEvent.click(spoilers);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: "Never mind" }));

    await waitFor(() => {
      expect(spoilers).not.toBeChecked();
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(userState.state.showSpoilers).toBe(false);
  });
});
