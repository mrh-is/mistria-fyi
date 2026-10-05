import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase } from "../test-helpers.js";
import { extractStoresMeta } from "./stores-meta.js";

import type { StoreId } from "#lib/types/tracker-data.js";

vi.mock("../localize.js", () => ({
  localizeField: vi.fn((_assetsDir: string, input: { englishValue: string }) => ({
    fallbackLocales: [],
    values: {
      en: input.englishValue,
      es: input.englishValue,
      fr: input.englishValue,
      ja: input.englishValue,
      ko: input.englishValue,
      ru: input.englishValue,
      "zh-Hans": input.englishValue,
      "zh-Hant": input.englishValue,
    },
  })),
}));
const assetsDir = "test-assets";

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({ stores: {}, ...overrides });
}

describe("extractStoresMeta", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts known stores with correct article classification", () => {
    const fiddle = makeFiddle({
      stores: {
        default: {},
        general: { name: "General Store" },
        merri: { name: "Merri's Stall" },
      },
    });

    const { localeNames, stores } = extractStoresMeta(fiddle, assetsDir);
    expect(stores).toEqual({
      general: { article: "the", upgradeAction: "repairing" },
      merri: {},
    });
    expect(localeNames.ja["general" as StoreId]).toBe("General Store");
  });

  it("uses the canonical store name from game data", () => {
    const fiddle = makeFiddle({
      stores: {
        general: { name: "General Store and Market" },
      },
    });

    expect(extractStoresMeta(fiddle, assetsDir).stores).toEqual({
      general: { article: "the", upgradeAction: "repairing" },
    });
  });

  it("assigns article 'the' for establishment stores", () => {
    const fiddle = makeFiddle({
      stores: {
        blacksmith: { name: "Blacksmith's Shop" },
        carpenter: { name: "Carpenter's Shop" },
        inn: { name: "Sleeping Dragon Inn" },
        terithia: { name: "Tackle Shop" },
      },
    });

    const { stores } = extractStoresMeta(fiddle, assetsDir);
    expect(stores["carpenter" as StoreId]).toEqual({ article: "the" });
    expect(stores["inn" as StoreId]).toEqual({ article: "the" });
    expect(stores["blacksmith" as StoreId]).toEqual({
      article: "the",
    });
    expect(stores["terithia" as StoreId]).toEqual({ article: "the" });
  });

  it("omits article for personal and bare-noun stalls", () => {
    const fiddle = makeFiddle({
      stores: {
        darcy: { name: "Darcy's Stall" },
        hayden: { name: "Hayden's Shop" },
        maple_spring_festival: { name: "Food Stall" },
      },
    });

    const { stores } = extractStoresMeta(fiddle, assetsDir);
    expect(stores["darcy" as StoreId]).toEqual({});
    expect(stores["hayden" as StoreId]).toEqual({});
    expect(stores["maple_spring_festival" as StoreId]).toEqual({});
  });

  it("adds upgradeAction for the general store and omits it for the inn", () => {
    const fiddle = makeFiddle({
      stores: {
        general: { name: "General Store" },
        inn: { name: "Sleeping Dragon Inn" },
      },
    });

    const { stores } = extractStoresMeta(fiddle, assetsDir);
    expect(stores["general" as StoreId]).toEqual({
      article: "the",
      upgradeAction: "repairing",
    });
    expect(stores["inn" as StoreId]).toEqual({ article: "the" });
  });

  it("throws on unknown store ID", () => {
    const fiddle = makeFiddle({
      stores: {
        mystery_vendor: { name: "Mystery Vendor" },
      },
    });

    expect(() => extractStoresMeta(fiddle, assetsDir)).toThrow(
      'Unknown store "mystery_vendor" — add it to KNOWN_STORES in stores-meta.ts',
    );
  });

  it("throws when a known store has no canonical name", () => {
    const fiddle = makeFiddle({
      stores: {
        general: { categories: [] },
      },
    });

    expect(() => extractStoresMeta(fiddle, assetsDir)).toThrow(
      'Store "general" has no name in stores.toml — check data assembly',
    );
  });

  it("returns empty when no stores data", () => {
    const fiddle = makeFiddle({ stores: undefined });
    const { stores } = extractStoresMeta(fiddle, assetsDir);
    expect(Object.keys(stores)).toEqual([]);
  });
});
