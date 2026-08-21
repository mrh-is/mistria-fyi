import { describe, expect, it } from "vitest";

import {
  filterAvailableItems,
  getDisplayBadges,
  hasSelectiveSeasonRestriction,
  hasTimelyRestriction,
  isItemAvailable,
  isRowVisible,
  isSourceAvailable,
  shouldCountItem,
} from "../availability.js";

import type { AvailabilityCondition, Source } from "$lib/types/acquisition.js";
import type { ItemId, Season, StoreId, Weather } from "$lib/types/tracker-data.js";
import type { NonEmptyArray } from "$lib/utils.js";

const spring = { season: "spring" as const, weather: "calm" as const };

function src(availability?: AvailabilityCondition): Source {
  return { ...(availability ? { availability } : {}), type: "store", storeId: "test" as StoreId };
}

const seasonCondition = (seasons: NonEmptyArray<Season>): AvailabilityCondition => ({
  type: "season",
  seasons,
});
const weatherCondition = (weathers: Weather[]): AvailabilityCondition => ({
  type: "weather",
  weathers,
});
const timeCondition = (start: number, end: number): AvailabilityCondition => ({
  type: "time",
  start,
  end,
});
const allSeasonsCondition = seasonCondition(["spring", "summer", "fall", "winter"]);

// ─── hasSelectiveSeasonRestriction ──────────────────────────────────

describe("hasSelectiveSeasonRestriction", () => {
  it("returns false when the source has no availability condition", () => {
    expect(hasSelectiveSeasonRestriction(src())).toBe(false);
  });

  it("returns false when all seasons are included", () => {
    expect(hasSelectiveSeasonRestriction(src(allSeasonsCondition))).toBe(false);
  });

  it("returns true when only some seasons are included", () => {
    expect(hasSelectiveSeasonRestriction(src(seasonCondition(["spring"])))).toBe(true);
  });
});

// ─── hasTimelyRestriction ────────────────────────────────────────────

describe("hasTimelyRestriction", () => {
  it("returns false when the source has no availability condition", () => {
    expect(hasTimelyRestriction(src())).toBe(false);
  });

  it("returns true for a season condition", () => {
    expect(hasTimelyRestriction(src(seasonCondition(["spring"])))).toBe(true);
  });

  it("returns true for a weather condition", () => {
    expect(hasTimelyRestriction(src(weatherCondition(["calm"])))).toBe(true);
  });

  it("returns true for a time condition", () => {
    expect(hasTimelyRestriction(src(timeCondition(6, 12)))).toBe(true);
  });

  it("returns false for a non-timely condition", () => {
    expect(hasTimelyRestriction(src({ type: "minesLevel", floor: 5 }))).toBe(false);
  });
});

// ─── isSourceAvailable ──────────────────────────────────────────────

describe("isSourceAvailable", () => {
  it("everything mode always returns true", () => {
    expect(isSourceAvailable(src(seasonCondition(["winter"])), spring, "everything")).toBe(true);
  });

  it("available mode with no availability condition returns true", () => {
    expect(isSourceAvailable(src(), spring, "available")).toBe(true);
  });

  it("timely mode with no availability condition returns false", () => {
    expect(isSourceAvailable(src(), spring, "timely")).toBe(false);
  });

  it("available mode returns true when the season condition matches", () => {
    expect(isSourceAvailable(src(seasonCondition(["spring"])), spring, "available")).toBe(true);
  });

  it("available mode returns false when the season condition doesn't match", () => {
    expect(isSourceAvailable(src(seasonCondition(["winter"])), spring, "available")).toBe(false);
  });

  it("timely mode returns true for a selective season condition that matches", () => {
    expect(isSourceAvailable(src(seasonCondition(["spring"])), spring, "timely")).toBe(true);
  });

  it("timely mode returns false for a non-selective (all seasons) condition", () => {
    expect(isSourceAvailable(src(allSeasonsCondition), spring, "timely")).toBe(false);
  });

  it("timely mode returns false when the selective season condition doesn't match", () => {
    expect(isSourceAvailable(src(seasonCondition(["winter"])), spring, "timely")).toBe(false);
  });
});

// ─── isItemAvailable ────────────────────────────────────────────────

describe("isItemAvailable", () => {
  it("available if ANY source passes (OR logic)", () => {
    expect(
      isItemAvailable(
        [src(seasonCondition(["winter"])), src(seasonCondition(["spring"]))],
        spring,
        "available",
      ),
    ).toBe(true);
  });

  it("unavailable if no source passes", () => {
    expect(isItemAvailable([src(seasonCondition(["winter"]))], spring, "available")).toBe(false);
  });

  it("no sources: available in available mode", () => {
    expect(isItemAvailable([], spring, "available")).toBe(true);
  });

  it("no sources: hidden in timely mode", () => {
    expect(isItemAvailable([], spring, "timely")).toBe(false);
  });

  it("everything mode: always available", () => {
    expect(isItemAvailable([src(seasonCondition(["winter"]))], spring, "everything")).toBe(true);
  });

  it("timely mode: available when a source has a selective season condition that matches", () => {
    expect(isItemAvailable([src(seasonCondition(["spring"]))], spring, "timely")).toBe(true);
  });
});

// ─── filterAvailableItems ───────────────────────────────────────────

describe("filterAvailableItems", () => {
  const ids = ["a", "b", "c"] as ItemId[];
  const lookup = (id: ItemId): Source[] => (id === "c" ? [] : [src()]);

  it("available mode passes items with sources through", () => {
    const result = filterAvailableItems(ids, lookup, spring, "available");
    expect(result).toEqual(ids);
  });

  it("timely mode excludes items with no timely condition", () => {
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

  it("incomplete items out of scope in timely mode when no sources are timely", () => {
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

// ─── getDisplayBadges ───────────────────────────────────────────────

describe("getDisplayBadges", () => {
  it("returns an empty object when no sources have availability conditions", () => {
    expect(getDisplayBadges([src(), src()])).toEqual({});
  });

  it("extracts seasons, weathers, and time range from a single source", () => {
    const condition: AvailabilityCondition = {
      type: "all",
      conditions: [seasonCondition(["spring"]), weatherCondition(["calm"]), timeCondition(6, 12)],
    };
    expect(getDisplayBadges([src(condition)])).toEqual({
      seasons: ["spring"],
      timeRange: [6, 12],
      weathers: ["calm"],
    });
  });

  it("merges badges across multiple sources, keeping the first found for each kind", () => {
    const sources = [src(seasonCondition(["spring"])), src(seasonCondition(["winter"]))];
    expect(getDisplayBadges(sources)).toEqual({ seasons: ["spring"] });
  });
});
