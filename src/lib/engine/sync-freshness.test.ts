import { describe, expect, it } from "vitest";

import { GAME_DAY } from "./import-save.js";
import {
  abnormalGapDays,
  MIN_ABNORMAL_GAP_DAYS,
  nextFreshness,
  readGameDate,
  REMEMBERED_GAPS,
} from "./sync-freshness.js";

const DAY = 86_400_000;
const HOUR = 3_600_000;

describe("readGameDate", () => {
  it("starts at Spring 1, Year 1", () => {
    expect(readGameDate({ gamedata: { date: 0 } })).toEqual({
      day: 1,
      season: "spring",
      year: 1,
    });
  });

  it("counts seasons & years on the game's calendar", () => {
    const days = 112 + 28 + 13;
    expect(readGameDate({ gamedata: { date: days * GAME_DAY + 100 } })).toEqual({
      day: 14,
      season: "summer",
      year: 2,
    });
  });

  it.each([{}, { gamedata: {} }, { gamedata: { date: "soon" } }, { gamedata: { date: -1 } }])(
    "reads no date from %j",
    (bundle) => {
      expect(readGameDate(bundle)).toBeUndefined();
    },
  );
});

describe("nextFreshness", () => {
  it("records the first save with no gap to learn", () => {
    expect(nextFreshness(undefined, 1000, undefined)).toEqual({ gaps: [], modified: 1000 });
  });

  it("learns the gap between saves", () => {
    const first = nextFreshness(undefined, 1000, undefined);
    expect(nextFreshness(first, 1000 + HOUR, undefined).gaps).toEqual([HOUR]);
  });

  it("learns nothing from a save re-sent unchanged, or one older than the last", () => {
    const first = nextFreshness(undefined, 5000, undefined);
    expect(nextFreshness(first, 5000, undefined).gaps).toEqual([]);
    expect(nextFreshness(first, 4000, undefined)).toEqual({ gaps: [], modified: 4000 });
  });

  it("keeps only the most recent gaps", () => {
    let freshness = nextFreshness(undefined, 0, undefined);
    for (let index = 1; index <= REMEMBERED_GAPS + 5; index++) {
      freshness = nextFreshness(freshness, freshness.modified + index, undefined);
    }
    expect(freshness.gaps).toHaveLength(REMEMBERED_GAPS);
    expect(freshness.gaps.at(-1)).toBe(REMEMBERED_GAPS + 5);
    expect(freshness.gaps[0]).toBe(6);
  });

  it("replaces the date with the latest save's, even when it has none", () => {
    const date = { day: 3, season: "fall", year: 1 } as const;
    const first = nextFreshness(undefined, 0, date);
    expect(first.gameDate).toEqual(date);
    expect(nextFreshness(first, 1, undefined).gameDate).toBeUndefined();
  });
});

describe("abnormalGapDays", () => {
  it("says nothing before any save", () => {
    expect(abnormalGapDays(undefined, 0)).toBeUndefined();
  });

  it("stays quiet under the minimum, even for a device that only knows short gaps", () => {
    const freshness = { gaps: [HOUR, HOUR], modified: 0 };
    expect(abnormalGapDays(freshness, MIN_ABNORMAL_GAP_DAYS * DAY - 1)).toBeUndefined();
    expect(abnormalGapDays(freshness, MIN_ABNORMAL_GAP_DAYS * DAY)).toBe(MIN_ABNORMAL_GAP_DAYS);
  });

  it("learns a longer rhythm from the gaps it remembers", () => {
    const weekly = { gaps: [7 * DAY], modified: 0 };
    expect(abnormalGapDays(weekly, 13 * DAY)).toBeUndefined();
    expect(abnormalGapDays(weekly, 14 * DAY)).toBe(14);
  });

  it("stays quiet when this clock is behind the save's", () => {
    expect(abnormalGapDays({ gaps: [], modified: 10 * DAY }, 0)).toBeUndefined();
  });
});
