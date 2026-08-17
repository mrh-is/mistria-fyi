import { describe, expect, it } from "vitest";

import {
  filterAvailableItems,
  getItemRestrictions,
  hasSelectiveSeasonRestriction,
  hasTimelyRestriction,
  isItemAvailable,
  isRowVisible,
  isSourceAvailable,
  shouldCountItem,
} from "../availability.js";

import type { AcquisitionSource, ItemId } from "$lib/types/tracker-data.js";

const spring = { season: "spring" as const, weather: "calm" as const };

function src(): AcquisitionSource {
  return { storeId: "test" as never, type: "store" };
}

// ─── Restriction-derived helpers (stubbed pending Task 2) ──────────────

describe("getItemRestrictions", () => {
  it("always returns an empty array (stubbed pending Task 2)", () => {
    expect(getItemRestrictions([src(), src()])).toEqual([]);
  });
});

describe("hasSelectiveSeasonRestriction", () => {
  it("always returns false (stubbed pending Task 2)", () => {
    expect(hasSelectiveSeasonRestriction(src())).toBe(false);
  });
});

describe("hasTimelyRestriction", () => {
  it("always returns false (stubbed pending Task 2)", () => {
    expect(hasTimelyRestriction(src())).toBe(false);
  });
});

// ─── isSourceAvailable ──────────────────────────────────────────────

describe("isSourceAvailable", () => {
  it("everything mode always returns true", () => {
    expect(isSourceAvailable(src(), spring, "everything")).toBe(true);
  });

  it("available mode always returns true (stubbed pending Task 2)", () => {
    expect(isSourceAvailable(src(), spring, "available")).toBe(true);
  });

  it("timely mode always returns false (stubbed pending Task 2)", () => {
    expect(isSourceAvailable(src(), spring, "timely")).toBe(false);
  });
});

// ─── isItemAvailable ────────────────────────────────────────────────

describe("isItemAvailable", () => {
  it("available if ANY source passes (OR logic; stubbed always-available in available mode)", () => {
    expect(isItemAvailable([src(), src()], spring, "available")).toBe(true);
  });

  it("no sources: available in available mode", () => {
    expect(isItemAvailable([], spring, "available")).toBe(true);
  });

  it("no sources: hidden in timely mode", () => {
    expect(isItemAvailable([], spring, "timely")).toBe(false);
  });

  it("everything mode: always available", () => {
    expect(isItemAvailable([src()], spring, "everything")).toBe(true);
  });

  it("timely mode: hidden regardless of sources (stubbed pending Task 2)", () => {
    expect(isItemAvailable([src()], spring, "timely")).toBe(false);
  });
});

// ─── filterAvailableItems ───────────────────────────────────────────

describe("filterAvailableItems", () => {
  const ids = ["a", "b", "c"] as ItemId[];
  const lookup = (id: ItemId): AcquisitionSource[] => (id === "c" ? [] : [src()]);

  it("available mode passes everything through (stubbed pending Task 2)", () => {
    const result = filterAvailableItems(ids, lookup, spring, "available");
    expect(result).toEqual(ids);
  });

  it("timely mode excludes all items (stubbed pending Task 2)", () => {
    const result = filterAvailableItems(ids, lookup, spring, "timely");
    expect(result).toEqual([]);
  });

  it("everything returns all", () => {
    expect(filterAvailableItems(ids, lookup, spring, "everything")).toEqual(ids);
  });
});

// ─── shouldCountItem ────────────────────────────────────────────────

describe("shouldCountItem", () => {
  it("completed items are always in scope regardless of availability", () => {
    expect(shouldCountItem([src()], true, spring, "available")).toBe(true);
    expect(shouldCountItem([src()], true, spring, "timely")).toBe(true);
    expect(shouldCountItem([src()], true, spring, "everything")).toBe(true);
  });

  it("incomplete items in scope when available", () => {
    expect(shouldCountItem([src()], false, spring, "available")).toBe(true);
  });

  it("incomplete items always in scope in everything mode", () => {
    expect(shouldCountItem([src()], false, spring, "everything")).toBe(true);
  });

  it("incomplete items out of scope in timely mode (stubbed pending Task 2)", () => {
    expect(shouldCountItem([], false, spring, "timely")).toBe(false);
  });
});

// ─── isRowVisible ───────────────────────────────────────────────────

describe("isRowVisible", () => {
  const id = "item_b" as ItemId;

  it("incomplete items are always visible", () => {
    expect(isRowVisible(id, false, false)).toBe(true);
    expect(isRowVisible(id, false, true)).toBe(true);
  });

  it("completed items hidden when showCompleted is false", () => {
    expect(isRowVisible(id, true, false)).toBe(false);
  });

  it("completed items visible when showCompleted is true", () => {
    expect(isRowVisible(id, true, true)).toBe(true);
  });

  it("recently completed items are always visible regardless of showCompleted", () => {
    const recentlyCompleted = new Set([id]);
    expect(isRowVisible(id, true, false, recentlyCompleted)).toBe(true);
  });

  it("items not in recentlyCompleted respect showCompleted", () => {
    const other = "other_item" as ItemId;
    const recentlyCompleted = new Set([other]);
    expect(isRowVisible(id, true, false, recentlyCompleted)).toBe(false);
  });
});
