import { describe, expect, it } from "vitest";

import { escapeHtml, OFFLINE_FONTS_SLOT, offlinePageHtml } from "./offline-page.js";

import type { OfflinePage } from "./offline-page.js";

const PAGE: OfflinePage = {
  copy: {
    en: { "copy.heading": "You’re offline", "offline.lang": "en" },
    es: { "copy.heading": "Estás sin conexión", "offline.lang": "es" },
    fr: { "copy.heading": "Vous êtes hors ligne", "offline.lang": "fr" },
    ja: { "copy.heading": "オフラインです", "offline.lang": "ja" },
    ko: { "copy.heading": "오프라인 상태입니다", "offline.lang": "ko" },
    ru: { "copy.heading": "Нет подключения к сети", "offline.lang": "ru" },
    "zh-Hans": { "copy.heading": "你已离线", "offline.lang": "zh-Hans" },
    "zh-Hant": { "copy.heading": "你已離線", "offline.lang": "zh-Hant" },
  },
  parts: ['<html lang="', '"><head>', "</head><h1>", "</h1></html>"],
  slots: ["offline.lang", OFFLINE_FONTS_SLOT, "copy.heading"],
};

describe("offlinePageHtml", () => {
  it("fills each slot with the locale's copy", () => {
    expect(offlinePageHtml(PAGE, "ja", undefined)).toBe(
      '<html lang="ja"><head></head><h1>オフラインです</h1></html>',
    );
  });

  it("links the locale's font stylesheet when it has one", () => {
    expect(offlinePageHtml(PAGE, "ko", "/_app/immutable/assets/locale-fonts-ko.a&b.css")).toBe(
      '<html lang="ko"><head><link rel="stylesheet" href="/_app/immutable/assets/locale-fonts-ko.a&amp;b.css" /></head><h1>오프라인 상태입니다</h1></html>',
    );
  });

  it("throws for a slot the locale has no value for", () => {
    expect(() =>
      offlinePageHtml({ ...PAGE, slots: ["offline.dir", "", ""] }, "en", undefined),
    ).toThrow(/en offline\.dir/);
  });
});

describe("escapeHtml", () => {
  it("escapes markup & attribute quotes", () => {
    expect(escapeHtml(`<a href="x">Tom & Jerry’s</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry’s&lt;/a&gt;",
    );
  });
});
