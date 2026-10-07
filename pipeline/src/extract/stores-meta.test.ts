import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase, stubLocalizer } from "../test-helpers.js";
import { extractStoresMeta } from "./stores-meta.js";

import type { StoreId } from "#lib/types/tracker-data.js";

const localizer = stubLocalizer();

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({ stores: {}, ...overrides });
}

describe("extractStoresMeta", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts known stores", () => {
    const fiddle = makeFiddle({
      stores: {
        default: {},
        general: { name: "General Store" },
        merri: { name: "Merri's Stall" },
      },
    });

    const { localeNames, stores } = extractStoresMeta(fiddle, localizer);
    expect(stores).toEqual({
      general: { upgradeAction: "repair" },
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

    expect(extractStoresMeta(fiddle, localizer).stores).toEqual({
      general: { upgradeAction: "repair" },
    });
  });

  it("emits no English grammar for any store", () => {
    const fiddle = makeFiddle({
      stores: {
        blacksmith: { name: "Blacksmith's Shop" },
        darcy: { name: "Darcy's Stall" },
        inn: { name: "Sleeping Dragon Inn" },
      },
    });

    expect(extractStoresMeta(fiddle, localizer).stores).toEqual({
      blacksmith: {},
      darcy: {},
      inn: {},
    });
  });

  it("adds upgradeAction for the general store and omits it for the inn", () => {
    const fiddle = makeFiddle({
      stores: {
        general: { name: "General Store" },
        inn: { name: "Sleeping Dragon Inn" },
      },
    });

    const { stores } = extractStoresMeta(fiddle, localizer);
    expect(stores["general" as StoreId]).toEqual({ upgradeAction: "repair" });
    expect(stores["inn" as StoreId]).toEqual({});
  });

  it("throws on unknown store ID", () => {
    const fiddle = makeFiddle({
      stores: {
        mystery_vendor: { name: "Mystery Vendor" },
      },
    });

    expect(() => extractStoresMeta(fiddle, localizer)).toThrow(
      'Unknown store "mystery_vendor" — add it to KNOWN_STORES in stores-meta.ts',
    );
  });

  it("throws when a known store has no canonical name", () => {
    const fiddle = makeFiddle({
      stores: {
        general: { categories: [] },
      },
    });

    expect(() => extractStoresMeta(fiddle, localizer)).toThrow(
      'Store "general" has no name in stores.toml — check data assembly',
    );
  });

  it("returns empty when no stores data", () => {
    const fiddle = makeFiddle({ stores: undefined });
    const { stores } = extractStoresMeta(fiddle, localizer);
    expect(Object.keys(stores)).toEqual([]);
  });
});
