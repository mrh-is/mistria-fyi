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

  it("lists the feedback sync log & says it goes in the public issue", () => {
    const { queries, text } = renderPage();

    const item = queries
      .getAllByRole("listitem")
      .find((entry) => entry.textContent.includes("sync log"));
    expect(item?.textContent).toContain("only if you opt in");
    expect(item?.textContent).toContain("recent sync activity from the tab you send it from");
    expect(item?.textContent).toContain("your game version and any game IDs");
    expect(item?.textContent).toContain(
      "It leaves out your character and farm names, your code and sync links, and your exact farm number, which gets hashed.",
    );
    expect(text).toContain("and your save file sync log (if you opted in)");
  });

  it("points to the sync log from “With sync”", () => {
    const { text } = renderPage();

    expect(text).toContain("attach your save file sync log, and that log is public");
  });

  it("names the feedback section as its heading reads in every locale", () => {
    for (const locale of locales) {
      expect(m.privacy_sync_what_feedback_log({}, { locale })).toContain(
        m.privacy_feedback_heading({}, { locale }),
      );
    }
  });

  it("warns against personal information in the public issue in every locale", () => {
    const warnings: Record<string, string> = {
      en: "Avoid including personal information",
      es: "Evita incluir información personal",
      fr: "Évitez d'inclure des informations personnelles",
      ja: "個人情報を含めないでください",
      ko: "개인정보를 포함하지 마세요",
      ru: "Не указывайте личную информацию",
      "zh-Hans": "请不要在留言中包含个人信息",
      "zh-Hant": "請不要在留言中包含個人資訊",
    };

    for (const locale of locales) {
      expect(m.privacy_feedback_public_middle({}, { locale })).toContain(warnings[locale]);
      expect(m.privacy_feedback_public_middle_sync_log({}, { locale })).toContain(warnings[locale]);
    }
  });

  it("leaves the page as it was when the switch is off", () => {
    syncSwitch.on = false;
    const { queries, text } = renderPage();

    expect(queries.queryByRole("heading", { name: "Without sync" })).toBeNull();
    expect(queries.queryByRole("heading", { name: "With sync" })).toBeNull();
    expect(queries.queryByRole("link", { name: "Turnstile Privacy Addendum" })).toBeNull();
    expect(text).not.toContain("end-to-end encrypted");
    expect(text).not.toContain("sync log");
    expect(text).toContain("and your progress data (if you opted in)");
    expect(queries.getByRole("heading", { level: 2, name: "The short version" })).toBeTruthy();
  });
});
