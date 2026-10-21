import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

import { inlineScriptHashes } from "../security/inline-scripts.js";
import { LOCALE_CODES } from "../types/locale.js";
import {
  BARE_PATH_STUB_SCRIPT,
  BARE_PATHS,
  barePathStubFile,
  renderBarePathStub,
} from "./bare-path-stub.js";
import { PRERENDERED_ROUTES } from "./prerender-entries.js";

interface Visit {
  cookie?: string;
  languages?: readonly string[];
  url: string;
}

/** Runs the stub's inline script against `visit` and returns the URL it replaced itself with. */
function landingUrl({ cookie = "", languages = [], url }: Visit): string {
  const { hash, pathname, search } = new URL(url, "https://mistria.fyi");
  const replace = vi.fn();
  // The exact script text the stub ships, run with only the browser globals it reads.
  runInNewContext(BARE_PATH_STUB_SCRIPT, {
    document: { cookie },
    location: { hash, pathname, replace, search },
    navigator: { languages },
  });
  expect(replace).toHaveBeenCalledTimes(1);
  return String(replace.mock.calls[0]?.[0]);
}

describe("bare paths", () => {
  it("covers the root and every prerendered route's bare slug", () => {
    expect(BARE_PATHS).toEqual(["/", ...PRERENDERED_ROUTES.filter((route) => route !== "")]);
  });

  it.each([
    ["/", "index.html"],
    ["/almanac", "almanac.html"],
  ])("serves %s from %s", (barePath, file) => {
    expect(barePathStubFile(barePath)).toBe(file);
  });
});

describe("bare-path stub script", () => {
  it("prefers the stored locale cookie", () => {
    expect(
      landingUrl({
        cookie: "theme=dark; mistria-fyi-locale=fr",
        languages: ["ja"],
        url: "/almanac",
      }),
    ).toBe("/fr/almanac");
  });

  it("ignores a cookie that isn't a supported locale", () => {
    expect(
      landingUrl({ cookie: "mistria-fyi-locale=xx", languages: ["ko"], url: "/almanac" }),
    ).toBe("/ko/almanac");
  });

  it.each([
    [["ja-JP"], "ja"],
    [["zh-hant"], "zh-Hant"],
    [["tlh", "es-MX"], "es"],
    [["zh-TW", "ru"], "ru"],
  ])("negotiates %j to %s, full tag then base language", (languages, locale) => {
    expect(landingUrl({ languages, url: "/museum" })).toBe(`/${locale}/museum`);
  });

  it("falls back to English", () => {
    expect(landingUrl({ languages: ["tlh"], url: "/museum" })).toBe("/en/museum");
    expect(landingUrl({ url: "/museum" })).toBe("/en/museum");
  });

  it("lands on the locale home from the root, without a trailing slash", () => {
    expect(landingUrl({ cookie: "mistria-fyi-locale=ru", url: "/" })).toBe("/ru");
  });

  it("preserves the query and fragment", () => {
    expect(landingUrl({ languages: ["en"], url: "/data?section=transfer" })).toBe(
      "/en/data?section=transfer",
    );
    expect(landingUrl({ languages: ["en"], url: "/villagers?q=1#villager-adeline" })).toBe(
      "/en/villagers?q=1#villager-adeline",
    );
  });
});

describe("renderBarePathStub", () => {
  it("carries the same single inline script on every stub, so one hash allows them all", () => {
    const hashes = new Set(
      BARE_PATHS.flatMap((barePath) => inlineScriptHashes(renderBarePathStub(barePath))),
    );
    expect(hashes.size).toBe(1);
    expect(inlineScriptHashes(renderBarePathStub("/"))).toEqual(
      inlineScriptHashes(`<script>${BARE_PATH_STUB_SCRIPT}</script>`),
    );
  });

  it("links every locale's copy of the page for visitors without JavaScript", () => {
    const html = renderBarePathStub("/almanac");
    for (const locale of LOCALE_CODES) {
      expect(html).toContain(`href="/${locale}/almanac" hreflang="${locale}" lang="${locale}"`);
    }
    expect(renderBarePathStub("/")).toContain('href="/zh-Hans" hreflang="zh-Hans"');
  });
});
