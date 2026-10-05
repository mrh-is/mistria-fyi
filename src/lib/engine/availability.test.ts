import { describe, expect, it } from "vitest";

import {
  classifyItemAvailability,
  filterAvailableItems,
  getDisplayBadges,
  isItemAvailable,
  isItemDimmed,
  isRowVisible,
  isSourceAvailable,
  shouldCountItem,
} from "./availability.js";

import type { AvailabilityCondition, Source } from "#lib/types/acquisition.js";
import type { AvailabilityWindow } from "#lib/types/availability.js";
import type { ItemId, Season, StoreId, Weather } from "#lib/types/tracker-data.js";
import type { NonEmptyArray } from "#lib/utils.js";

const spring = { season: "spring" as const, weather: "calm" as const };
const defaultWindows: AvailabilityWindow[] = ["now", "anytime"];

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

describe("classifyItemAvailability", () => {
  it("partitions unrestricted entries as anytime", () => {
    expect(classifyItemAvailability([], spring)).toBe("anytime");
    expect(classifyItemAvailability([src()], spring)).toBe("anytime");
    expect(classifyItemAvailability([src(allSeasonsCondition)], spring)).toBe("anytime");
  });

  it("partitions matching timely entries as now and non-matches as later", () => {
    expect(classifyItemAvailability([src(seasonCondition(["spring"]))], spring)).toBe("now");
    expect(classifyItemAvailability([src(seasonCondition(["winter"]))], spring)).toBe("later");
  });

  it("uses an unrestricted source when an item also has a timely source", () => {
    expect(classifyItemAvailability([src(), src(seasonCondition(["winter"]))], spring)).toBe(
      "anytime",
    );
  });

  it("supports independently selected windows", () => {
    expect(isItemAvailable([src(seasonCondition(["spring"]))], spring, ["now"])).toBe(true);
    expect(isItemAvailable([src()], spring, ["now"])).toBe(false);
    expect(isItemAvailable([src()], spring, ["anytime"])).toBe(true);
    expect(isItemAvailable([src(seasonCondition(["winter"]))], spring, ["later"])).toBe(true);
    expect(isItemAvailable([src(seasonCondition(["winter"]))], spring, defaultWindows)).toBe(false);
  });
});

// ─── isItemDimmed ───────────────────────────────────────────────────

describe("isItemDimmed", () => {
  const laterItem = [src(seasonCondition(["winter"]))];

  it("never dims completed items", () => {
    expect(isItemDimmed(laterItem, true, spring, ["now", "anytime", "later"])).toBe(false);
  });

  it("dims a later item when shown alongside now/anytime windows for contrast", () => {
    expect(isItemDimmed(laterItem, false, spring, ["now", "anytime", "later"])).toBe(true);
    expect(isItemDimmed(laterItem, false, spring, ["now", "later"])).toBe(true);
  });

  it("does not dim when later is the only selected window", () => {
    expect(isItemDimmed(laterItem, false, spring, ["later"])).toBe(false);
  });

  it("does not dim when later isn't selected at all", () => {
    expect(isItemDimmed(laterItem, false, spring, defaultWindows)).toBe(false);
  });

  it("does not dim items that aren't classified as later", () => {
    expect(isItemDimmed([src()], false, spring, ["now", "anytime", "later"])).toBe(false);
  });
});

// ─── filterAvailableItems ───────────────────────────────────────────

function sourcesFor(id: ItemId): Source[] {
  return id === "c" ? [] : [src()];
}

function failingLookup(): Source[] {
  throw new Error("source lookup should not run");
}

describe("filterAvailableItems", () => {
  const ids = ["a", "b", "c"] as ItemId[];

  it("available mode passes items with sources through", () => {
    const result = filterAvailableItems(ids, sourcesFor, spring, "available");
    expect(result).toEqual(ids);
  });

  it("timely mode excludes items with no timely condition", () => {
    const result = filterAvailableItems(ids, sourcesFor, spring, "timely");
    expect(result).toEqual([]);
  });

  it("everything returns all", () => {
    expect(filterAvailableItems(ids, sourcesFor, spring, "everything")).toBe(ids);
  });

  it("skips source lookup when every availability window is selected", () => {
    expect(filterAvailableItems(ids, failingLookup, spring, ["later", "now", "anytime"])).toBe(ids);
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
