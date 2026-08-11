import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractStoresMeta } from "./stores-meta.js";

import type { StoreId } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    stores: {},
    ...overrides,
  } as unknown as ParsedGameData;
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

    const stores = extractStoresMeta(fiddle);
    expect(stores).toEqual({
      general: { article: "the", name: "General Store" },
      merri: { name: "Merri's Stall" },
    });
  });

  it("uses the canonical store name from game data", () => {
    const fiddle = makeFiddle({
      stores: {
        general: { name: "General Store and Market" },
      },
    });

    expect(extractStoresMeta(fiddle)).toEqual({
      general: { article: "the", name: "General Store and Market" },
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

    const stores = extractStoresMeta(fiddle);
    expect(stores["carpenter" as StoreId]).toEqual({ article: "the", name: "Carpenter's Shop" });
    expect(stores["inn" as StoreId]).toEqual({ article: "the", name: "Sleeping Dragon Inn" });
    expect(stores["blacksmith" as StoreId]).toEqual({
      article: "the",
      name: "Blacksmith's Shop",
    });
    expect(stores["terithia" as StoreId]).toEqual({ article: "the", name: "Tackle Shop" });
  });

  it("omits article for personal and bare-noun stalls", () => {
    const fiddle = makeFiddle({
      stores: {
        darcy: { name: "Darcy's Stall" },
        hayden: { name: "Hayden's Shop" },
        maple_spring_festival: { name: "Food Stall" },
      },
    });

    const stores = extractStoresMeta(fiddle);
    expect(stores["darcy" as StoreId]).toEqual({ name: "Darcy's Stall" });
    expect(stores["hayden" as StoreId]).toEqual({ name: "Hayden's Shop" });
    expect(stores["maple_spring_festival" as StoreId]).toEqual({ name: "Food Stall" });
  });

  it("throws on unknown store ID", () => {
    const fiddle = makeFiddle({
      stores: {
        mystery_vendor: { name: "Mystery Vendor" },
      },
    });

    expect(() => extractStoresMeta(fiddle)).toThrow(
      'Unknown store "mystery_vendor" — add it to KNOWN_STORES in stores-meta.ts',
    );
  });

  it("throws when a known store has no canonical name", () => {
    const fiddle = makeFiddle({
      stores: {
        general: { categories: [] },
      },
    });

    expect(() => extractStoresMeta(fiddle)).toThrow(
      'Store "general" has no name in stores.toml — check data assembly',
    );
  });

  it("returns empty when no stores data", () => {
    const fiddle = makeFiddle({ stores: undefined });
    const stores = extractStoresMeta(fiddle);
    expect(Object.keys(stores)).toEqual([]);
  });
});
