import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";

const { select } = vi.hoisted(() => ({ select: vi.fn<(locale: string) => Promise<boolean>>() }));

vi.mock("#lib/stores/locale-preference.svelte.js", () => ({ localePreference: { select } }));

import QuickSettingsLanguagePicker from "#lib/components/quick-settings-language-picker.svelte";

afterEach(() => {
  cleanup();
  select.mockReset();
});

async function chooseLanguage(name: string): Promise<void> {
  render(QuickSettingsLanguagePicker);
  await fireEvent.click(screen.getByRole("button", { name: "Choose language" }));
  await fireEvent.click(screen.getByRole("button", { name }));
}

describe("QuickSettingsLanguagePicker", () => {
  it("explains, in the reader's language, why an undownloaded language can't open offline", async () => {
    select.mockResolvedValue(false);

    await chooseLanguage("简体中文 Beta translation");

    expect(select).toHaveBeenCalledWith("zh-Hans");
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Go online to download the Simplified Chinese text, then try again.",
    );
  });

  it("shows no message when the switch goes ahead", async () => {
    select.mockResolvedValue(true);

    await chooseLanguage("日本語 Beta translation");

    expect(select).toHaveBeenCalledWith("ja");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});
