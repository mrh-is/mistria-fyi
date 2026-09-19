import { describe, expect, it } from "vitest";

import { getName, hasNames, loadNames, loadPageNames } from "$lib/data/names.js";

import { load as loadVillagers } from "../../routes/(category)/villagers/+page";

import type { ItemId, VillagerId } from "$lib/types/tracker-data.js";

const balor = "balor" as VillagerId;
const turnip = "turnip" as ItemId;

/**
 * Runs under `vitest.mocked.config.ts` with no preload setup, so `names.js` starts cold: nothing
 * is resident until a test awaits it. That's the only way to observe the loading boundary.
 */
describe("name chunk loading", () => {
  it("throws on a chunk that exists but was never awaited, rather than degrading to English", () => {
    expect(hasNames("ja", ["villagers"])).toBe(false);
    expect(() => getName("villagers", balor, "ja")).toThrow(/"ja\/villagers" is not loaded/);
    expect(() => getName("villagers", balor, "en")).toThrow(/"en\/villagers" is not loaded/);
  });

  it("loads only the requested categories in the requested locale, with no English chunk", async () => {
    await loadNames("ja", ["villagers"]);

    expect(hasNames("ja", ["villagers"])).toBe(true);
    expect(hasNames("en", ["villagers"])).toBe(false);
    expect(getName("villagers", balor, "ja")).toBe("バロル");
    expect(() => getName("villagers", balor, "en")).toThrow(/"en\/villagers" is not loaded/);

    expect(hasNames("ja", ["items"])).toBe(false);
    expect(() => getName("items", turnip, "ja")).toThrow(/not loaded/);
  });

  it("keeps other locales cold when one locale loads", async () => {
    await loadNames("ja", ["villagers"]);
    expect(hasNames("fr", ["villagers"])).toBe(false);
    expect(() => getName("villagers", balor, "fr")).toThrow(/"fr\/villagers" is not loaded/);
  });

  it("shares one load per chunk across concurrent callers", async () => {
    const first = loadNames("ko", ["skills"]);
    const second = loadNames("ko", ["skills"]);
    await Promise.all([first, second]);
    expect(hasNames("ko", ["skills"])).toBe(true);
  });
});

describe("loadPageNames", () => {
  it("skips loading when called without an event, as the sitemap harvester does", async () => {
    await loadPageNames(undefined, ["cosmetics"]);
    expect(hasNames("en", ["cosmetics"])).toBe(false);
  });

  it("scopes a category route's load() to its own categories in the layout's locale", async () => {
    await loadVillagers({
      parent: () => Promise.resolve({ locale: "ru" as const }),
      url: new URL("https://mistria.fyi/ru/villagers"),
    } as never);

    expect(hasNames("ru", ["villagers"])).toBe(true);
    // Not on the villagers page, so not fetched.
    expect(hasNames("ru", ["items"])).toBe(false);
    expect(hasNames("ru", ["cosmetics"])).toBe(false);
    // Only the layout-resolved locale: no English chunk rides along.
    expect(hasNames("zh-Hant", ["villagers"])).toBe(false);
    expect(hasNames("en", ["villagers"])).toBe(false);
  });
});
