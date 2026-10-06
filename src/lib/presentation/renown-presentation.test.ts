import { describe, expect, it } from "vitest";

import { getRankState, getRenownPresentation } from "#lib/presentation/renown-presentation.js";

import type { TownRank } from "#lib/types/tracker-data.js";

const ranks: TownRank[] = [
  { levels: { start: 0, end: 9 } },
  { levels: { start: 10, end: 19 } },
  { levels: { start: 20, end: 20 } },
];

describe("renown presentation", () => {
  it.each([
    { index: 0, level: 0, rank: "Wood", span: 10, within: 0 },
    { index: 0, level: 9, rank: "Wood", span: 10, within: 9 },
    { index: 1, level: 10, rank: "Stone", span: 10, within: 0 },
    { index: 2, level: 20, rank: "Crown", span: 1, within: 0 },
  ])("derives rank at $level from inclusive ranges", ({ index, level, span, within }) => {
    const result = getRenownPresentation(level, ranks);
    expect(result.currentRankIndex).toBe(index);
    expect(result.rankSpan).toBe(span);
    expect(result.withinRank).toBe(within);
  });

  it("distinguishes completed, current, and upcoming ranks", () => {
    expect(getRankState(10, ranks[0])).toBe("completed");
    expect(getRankState(10, ranks[1])).toBe("current");
    expect(getRankState(10, ranks[2])).toBe("upcoming");
  });
});
