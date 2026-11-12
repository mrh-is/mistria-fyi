import { describe, expect, it } from "vitest";

import { overwriteGetLocale } from "#lib/i18n/locale-runtime.js";
import { pageStub } from "#lib/test-utils/page-stub.svelte.js";
import { renderToFragment } from "#lib/test-utils/render-to-fragment.js";
import { LOCALE_CODES } from "#lib/types/locale.js";

import PrivacyPage from "./+page.svelte";

import type { LocaleCode } from "#lib/types/locale.js";

function renderPage(locale: LocaleCode = "en") {
  pageStub.data = { locale };
  overwriteGetLocale(() => locale);
  try {
    return renderToFragment(PrivacyPage, { props: {} });
  } finally {
    overwriteGetLocale();
    pageStub.reset();
  }
}

describe("privacy page sync sections", () => {
  it("splits into “Without sync” & “With sync”", () => {
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
    expect(text).toContain("until that code stops working");
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

  it("says what encryption covers & that players still trust the code they’re served", () => {
    const { queries, text } = renderPage();

    expect(queries.getByRole("heading", { level: 3, name: "What you’re trusting" })).toBeTruthy();
    expect(text).toContain("Encryption protects the save file the server stores");
    expect(text).toContain("you’re trusting the app your browser gets from us");
    expect(text).toContain("the Cloudflare Turnstile script");
    expect(text).toContain("open the feedback form");
  });

  it.each(LOCALE_CODES)("keeps the date, email retention and addendum in %s", (locale) => {
    const { container, text } = renderPage(locale);
    const date = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(
      Date.UTC(2026, 10, 5),
    );
    expect(text).toContain(date);
    expect(text).toContain("90");
    expect(
      container
        .querySelector('a[href="https://www.cloudflare.com/turnstile-privacy-policy/"]')
        ?.textContent.trim(),
    ).toBeTruthy();
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
    for (const locale of LOCALE_CODES) {
      const { queries } = renderPage(locale);
      const feedbackHeading = queries.getAllByRole("heading", { level: 3 })[2]?.textContent?.trim();
      expect(feedbackHeading).toBeTruthy();
      expect(
        queries.getAllByRole("paragraph").some((p) => p.textContent.includes(feedbackHeading)),
      ).toBe(true);
    }
  });

  it("warns against personal information in the public issue in every locale", () => {
    const warnings: Record<string, string> = {
      en: "Avoid including personal information",
      es: "Evita incluir información personal",
      fr: "Évitez d’inclure des informations personnelles",
      ja: "個人情報を含めないでください",
      ko: "개인정보는 넣지 마세요",
      ru: "Не указывайте личную информацию",
      "zh-Hans": "请不要在留言中包含个人信息",
      "zh-Hant": "請不要在留言中包含個人資訊",
    };

    for (const locale of LOCALE_CODES) {
      expect(renderPage(locale).text).toContain(warnings[locale]);
    }
  });
});
