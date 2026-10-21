import { describe, expect, it } from "vitest";

import {
  emptyMergeCounts,
  nextQuestState,
  questStateRank,
  SEASON_ORDER,
  seasonFromOrdinal,
  seasonOrdinal,
} from "./domain-primitives.js";

import type { MergeCounts } from "#lib/types/user-progress.js";

describe("seasons", () => {
  it("orders seasons chronologically", () => {
    expect(SEASON_ORDER).toEqual(["spring", "summer", "fall", "winter"]);
  });

  it("round-trips ordinals", () => {
    for (const season of SEASON_ORDER) {
      expect(seasonFromOrdinal(seasonOrdinal(season))).toBe(season);
    }
    expect(seasonOrdinal("fall")).toBe(2);
  });
});

describe("quest states", () => {
  it("cycles none, obtained, completed, none", () => {
    expect(nextQuestState("none")).toBe("obtained");
    expect(nextQuestState("obtained")).toBe("completed");
    expect(nextQuestState("completed")).toBe("none");
  });

  it("ranks states by progress", () => {
    expect(questStateRank("none")).toBeLessThan(questStateRank("obtained"));
    expect(questStateRank("obtained")).toBeLessThan(questStateRank("completed"));
  });
});

describe("emptyMergeCounts", () => {
  it("zeroes every counter and returns a fresh object", () => {
    const counts: MergeCounts = emptyMergeCounts();
    expect(Object.keys(counts)).toHaveLength(20);
    expect(Object.values(counts).every((n) => n === 0)).toBe(true);
    expect(emptyMergeCounts()).not.toBe(counts);
  });
});
