import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { describe, expect, it } from "vitest";

import QuickSettingsPanel from "#lib/components/quick-settings-panel.svelte";
import { userState } from "#lib/stores/user-state.svelte.js";
import * as m from "#lib/ui-messages/messages.js";

describe("QuickSettingsPanel", () => {
  it("groups compact links to the data and About pages", () => {
    const { container } = render(QuickSettingsPanel);

    expect(screen.getByRole("link", { name: m.settings_data_link() })).toHaveAttribute(
      "href",
      "/en/data",
    );
    expect(screen.getByRole("link", { name: m.settings_about_link() })).toHaveAttribute(
      "href",
      "/en/about",
    );
    expect(container.querySelector(".quick-settings__links")?.children).toHaveLength(2);
  });

  it("lists every shipped language by its native name, with beta translations marked", async () => {
    render(QuickSettingsPanel);

    await fireEvent.click(screen.getByRole("button", { name: m.settings_choose_language() }));

    expect(screen.getByRole("button", { name: m.settings_choose_language() })).toHaveAttribute(
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

    const spoilers = screen.getByRole("switch", { name: m.settings_show_spoilers() });
    await fireEvent.click(spoilers);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: m.settings_spoilers_cancel() }));

    await waitFor(() => {
      expect(spoilers).not.toBeChecked();
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(userState.state.showSpoilers).toBe(false);
  });
});
