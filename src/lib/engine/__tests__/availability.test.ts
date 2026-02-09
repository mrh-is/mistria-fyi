import { describe, expect, it } from "vitest";

import { filterAvailableItems, isItemAvailable, isSourceAvailable } from "../availability.js";

import type { ItemId, Source } from "$lib/types/tracker-data.js";

const spring = { season: "spring" as const, weather: "calm" as const };
const summerRain = { season: "summer" as const, weather: "inclement" as const };

function src(restrictions: Source["restrictions"] = []): Source {
  return { restrictions, type: "store" };
}

const seasonRestriction = (seasons: string[]) => ({
  seasons: seasons as never[],
  type: "season" as const,
});
const weatherRestriction = (weathers: string[]) => ({
  type: "weather" as const,
  weathers: weathers as never[],
});

// ─── isSourceAvailable ──────────────────────────────────────────────

describe("isSourceAvailable", () => {
  it("everything mode always returns true", () => {
    const source = src([seasonRestriction(["summer"])]);
    expect(isSourceAvailable(source, spring, "everything")).toBe(true);
  });

  it("available mode: matching season passes", () => {
    const source = src([seasonRestriction(["spring", "fall"])]);
    expect(isSourceAvailable(source, spring, "available")).toBe(true);
  });

  it("available mode: non-matching season fails", () => {
    const source = src([seasonRestriction(["summer"])]);
    expect(isSourceAvailable(source, spring, "available")).toBe(false);
  });

  it("available mode: no restrictions passes", () => {
    expect(isSourceAvailable(src(), spring, "available")).toBe(true);
  });

  it("available mode: spoilable restrictions are ignored", () => {
    const source = src([{ building: "inn", type: "building" as const }]);
    expect(isSourceAvailable(source, spring, "available")).toBe(true);
  });

  it("available mode: weather must match", () => {
    const source = src([weatherRestriction(["inclement", "heavy_inclement"])]);
    expect(isSourceAvailable(source, spring, "available")).toBe(false);
    expect(isSourceAvailable(source, summerRain, "available")).toBe(true);
  });

  it("available mode: combined season+weather must both match", () => {
    const source = src([seasonRestriction(["summer"]), weatherRestriction(["inclement"])]);
    expect(isSourceAvailable(source, spring, "available")).toBe(false);
    expect(isSourceAvailable(source, summerRain, "available")).toBe(true);
  });

  it("timely mode: source without timely restrictions returns false", () => {
    expect(isSourceAvailable(src(), spring, "timely")).toBe(false);
    expect(
      isSourceAvailable(src([{ building: "inn", type: "building" as const }]), spring, "timely"),
    ).toBe(false);
  });

  it("timely mode: matching timely source returns true", () => {
    const source = src([seasonRestriction(["spring"])]);
    expect(isSourceAvailable(source, spring, "timely")).toBe(true);
  });

  it("timely mode: non-matching timely source returns false", () => {
    const source = src([seasonRestriction(["summer"])]);
    expect(isSourceAvailable(source, spring, "timely")).toBe(false);
  });

  it("time restrictions always pass (not filtered in Phase 3)", () => {
    const source = src([{ hours: [6, 18] as [number, number], type: "time" as const }]);
    expect(isSourceAvailable(source, spring, "available")).toBe(true);
    // For timely mode, having a time restriction qualifies as timely
    expect(isSourceAvailable(source, spring, "timely")).toBe(true);
  });
});

// ─── isItemAvailable ────────────────────────────────────────────────

describe("isItemAvailable", () => {
  const id = "test_item" as ItemId;

  it("available if ANY source passes (OR logic)", () => {
    const sources: Partial<Record<ItemId, Source[]>> = {
      [id]: [src([seasonRestriction(["summer"])]), src()],
    };
    expect(isItemAvailable(id, sources, spring, "available")).toBe(true);
  });

  it("unavailable if ALL sources fail", () => {
    const sources: Partial<Record<ItemId, Source[]>> = {
      [id]: [src([seasonRestriction(["summer"])]), src([seasonRestriction(["fall"])])],
    };
    expect(isItemAvailable(id, sources, spring, "available")).toBe(false);
  });

  it("no sources: available in available mode", () => {
    expect(isItemAvailable(id, {}, spring, "available")).toBe(true);
  });

  it("no sources: hidden in timely mode", () => {
    expect(isItemAvailable(id, {}, spring, "timely")).toBe(false);
  });

  it("everything mode: always available", () => {
    const sources: Partial<Record<ItemId, Source[]>> = {
      [id]: [src([seasonRestriction(["summer"])])],
    };
    expect(isItemAvailable(id, sources, spring, "everything")).toBe(true);
  });
});

// ─── filterAvailableItems ───────────────────────────────────────────

describe("filterAvailableItems", () => {
  const ids = ["a", "b", "c"] as ItemId[];
  const sources: Partial<Record<ItemId, Source[]>> = {
    ["a" as ItemId]: [src([seasonRestriction(["spring"])])],
    ["b" as ItemId]: [src([seasonRestriction(["summer"])])],
    // "c" has no sources
  };

  it("available mode filters by season", () => {
    const result = filterAvailableItems(ids, sources, spring, "available");
    expect(result).toContain("a");
    expect(result).not.toContain("b");
    expect(result).toContain("c"); // no sources = available
  });

  it("timely mode excludes items without timely sources", () => {
    const result = filterAvailableItems(ids, sources, spring, "timely");
    expect(result).toContain("a");
    expect(result).not.toContain("b");
    expect(result).not.toContain("c"); // no sources = not timely
  });

  it("everything returns all", () => {
    expect(filterAvailableItems(ids, sources, spring, "everything")).toEqual(ids);
  });
});
