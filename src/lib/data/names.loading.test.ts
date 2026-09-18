import { describe, expect, it } from "vitest";

import { getName, hasNames, loadNames, loadPageNames } from "$lib/data/names.js";

import { load as loadCharacters } from "../../routes/(category)/characters/+page.js";

import type { ItemId, NpcId } from "$lib/types/tracker-data.js";

const balor = "balor" as NpcId;
const turnip = "turnip" as ItemId;

/**
 * Runs under `vitest.mocked.config.ts` with no preload setup, so `names.js` starts cold: nothing
 * is resident until a test awaits it. That's the only way to observe the loading boundary.
 */
describe("name chunk loading", () => {
  it("throws on a chunk that exists but was never awaited, rather than degrading to English", () => {
    expect(hasNames("ja", ["npcs"])).toBe(false);
    expect(() => getName("npcs", balor, "ja")).toThrow(/"ja\/npcs" is not loaded/);
    expect(() => getName("npcs", balor, "en")).toThrow(/"en\/npcs" is not loaded/);
  });

  it("loads only the requested categories, with their English fallback", async () => {
    await loadNames("ja", ["npcs"]);

    expect(hasNames("ja", ["npcs"])).toBe(true);
    expect(hasNames("en", ["npcs"])).toBe(true);
    expect(getName("npcs", balor, "ja")).toBe("バロル");
    expect(getName("npcs", balor, "en")).toBe("Balor");

    expect(hasNames("ja", ["items"])).toBe(false);
    expect(hasNames("en", ["items"])).toBe(false);
    expect(() => getName("items", turnip, "ja")).toThrow(/not loaded/);
  });

  it("keeps other locales cold when one locale loads", async () => {
    await loadNames("ja", ["npcs"]);
    expect(hasNames("fr", ["npcs"])).toBe(false);
    expect(() => getName("npcs", balor, "fr")).toThrow(/"fr\/npcs" is not loaded/);
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
    await loadCharacters({
      parent: () => Promise.resolve({ locale: "ru" as const }),
      url: new URL("https://mistria.fyi/ru/characters"),
    } as never);

    expect(hasNames("ru", ["npcs"])).toBe(true);
    // Not on the characters page, so not fetched.
    expect(hasNames("ru", ["items"])).toBe(false);
    expect(hasNames("ru", ["cosmetics"])).toBe(false);
    // Only the layout-resolved locale, plus English fallback.
    expect(hasNames("zh-Hant", ["npcs"])).toBe(false);
  });
});
