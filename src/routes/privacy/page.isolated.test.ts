import { beforeEach, describe, expect, it, vi } from "vitest";

import * as m from "#lib/paraglide/messages.js";
import { locales } from "#lib/paraglide/runtime.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";

import PrivacyPage from "./+page.svelte";

const syncSwitch = vi.hoisted(() => ({ on: true }));

vi.mock("#lib/sync/sync-switch.js", () => ({
  get syncSwitchOn() {
    return syncSwitch.on;
  },
}));

function renderPage() {
  return renderToFragment(PrivacyPage, { props: {} });
}

describe("privacy page sync sections", () => {
  beforeEach(() => {
    syncSwitch.on = true;
  });

  it("splits into “Without sync” & “With sync” when the switch is on", () => {
    const { queries } = renderPage();

    expect(queries.getByRole("heading", { level: 2, name: "Without sync" })).toBeTruthy();
    expect(queries.getByRole("heading", { level: 2, name: "With sync" })).toBeTruthy();
    expect(queries.getByRole("heading", { level: 3, name: "The short version" })).toBeTruthy();
  });

  it("covers each sync disclosure", () => {
    const { text } = renderPage();

    expect(text).toContain("opt-in");
    expect(text).toContain("Only the game’s save file gets synced");
    expect(text).toContain("end-to-end encrypted");
    expect(text).toContain("the server that passes it along");
    expect(text).toContain("only the latest save file for each code");
    expect(text).toContain("30 days after it was sent");
    expect(text).toContain("until you make a new one");
    expect(text).toContain("off stream");
    expect(text).toContain("Cloudflare processes IP addresses");
    expect(text).toContain("we don’t log them");
    expect(text).toContain("how often one address can ask for it");
    expect(text).toContain("without saving the address in our storage");
    expect(text).toContain("There’s no account");
    expect(text).toContain("recovery copy");
    expect(text).toContain("a replaced or deleted save file");
    expect(text).toContain("up to 30 more days");
    expect(text).toContain("a small record for each code");
    expect(text).toContain("one-way fingerprints");
    expect(text).toContain("That record isn’t encrypted");
  });

  it("keeps the addendum link's slot in every locale", () => {
    for (const locale of locales) {
      expect(m.privacy_sync_turnstile_body({ addendum: "SLOT" }, { locale })).toContain("SLOT");
    }
  });

  it("links Cloudflare’s Turnstile Privacy Addendum", () => {
    const { queries } = renderPage();

    expect(
      queries.getByRole("link", { name: "Turnstile Privacy Addendum" }).getAttribute("href"),
    ).toBe("https://www.cloudflare.com/turnstile-privacy-policy/");
  });

  it("leaves the page as it was when the switch is off", () => {
    syncSwitch.on = false;
    const { queries, text } = renderPage();

    expect(queries.queryByRole("heading", { name: "Without sync" })).toBeNull();
    expect(queries.queryByRole("heading", { name: "With sync" })).toBeNull();
    expect(queries.queryByRole("link", { name: "Turnstile Privacy Addendum" })).toBeNull();
    expect(text).not.toContain("end-to-end encrypted");
    expect(queries.getByRole("heading", { level: 2, name: "The short version" })).toBeTruthy();
  });
});
