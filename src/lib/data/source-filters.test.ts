import { describe, expect, it } from "vitest";

import { SOURCE_ICON } from "#lib/components/icon/index.js";
import {
  sortSourceFiltersByLabel,
  SOURCE_FILTERS,
  sourceFilterLabel,
  sourceFilterMembersLabel,
} from "#lib/data/source-filters.js";

function filter(id: string) {
  const match = SOURCE_FILTERS.find((candidate) => candidate.id === id);
  if (!match) throw new Error(`Missing source filter: ${id}`);
  return match;
}

describe("SOURCE_FILTERS", () => {
  it("covers every source type exactly once", () => {
    const allSourceTypes = new Set(Object.keys(SOURCE_ICON));
    const filteredTypes = SOURCE_FILTERS.flatMap((group) => group.types);

    expect(filteredTypes).toHaveLength(allSourceTypes.size);
    expect(new Set(filteredTypes)).toEqual(allSourceTypes);
  });

  it("preserves the established source groups and order", () => {
    expect(SOURCE_FILTERS.map(({ id }) => id)).toEqual([
      "chests",
      "crafting",
      "dating",
      "farming",
      "festivals",
      "fishing",
      "gathering",
      "mines",
      "museum",
      "offerings",
      "perks",
      "stores",
      "progress",
    ]);
  });
});

describe("source filter labels", () => {
  it("resolves labels and members from the active locale's messages", () => {
    expect(sourceFilterLabel("gathering", "en")).toBe("Gathering");
    expect(sourceFilterLabel("gathering", "ja")).toBe("採集");
    expect(sourceFilterLabel("museum", "ja")).toBe("博物館");
  });

  it("joins members with the locale's list format", () => {
    expect(sourceFilterMembersLabel(filter("offerings"), "en")).toBe(
      "Chicken statue, Horse statue, and Wishing well",
    );
    expect(sourceFilterMembersLabel(filter("offerings"), "ja")).toBe(
      "ニワトリ像、馬の像、願いの井戸",
    );
    expect(sourceFilterMembersLabel(filter("chests"), "en")).toBe(
      "Hidden chests, Treasure boxes, and Lost & found",
    );
  });

  it("orders filters by their label in the given locale", () => {
    const filters = [filter("stores"), filter("progress"), filter("chests")];

    expect(sortSourceFiltersByLabel(filters, "en").map(({ id }) => id)).toEqual([
      "chests",
      "progress",
      "stores",
    ]);
    expect(sortSourceFiltersByLabel(filters, "es").map(({ id }) => id)).toEqual([
      "chests",
      "progress",
      "stores",
    ]);
    expect(sortSourceFiltersByLabel(filters, "fr").map(({ id }) => id)).toEqual([
      "stores",
      "chests",
      "progress",
    ]);
  });
});
