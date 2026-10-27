import { describe, expect, it } from "vitest";

import { AVAILABILITY_WINDOWS, DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";

import {
  classifyItemAvailability,
  classifySourceAvailability,
  getDisplayBadges,
  isInProgressScope,
  isItemAvailable,
  isItemDimmed,
  isRowVisible,
} from "./availability.js";

import type { AvailabilityCondition, Source } from "#lib/types/acquisition.js";
import type { AvailabilityWindow } from "#lib/types/availability.js";
import type {
  ItemId,
  PerkId,
  QuestId,
  Season,
  SkillId,
  StoreId,
  VillagerId,
  Weather,
} from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";
import type { NonEmptyArray } from "#lib/utils/record.js";

import type { RowWindowContext, WindowedRow } from "./availability.js";
import type { UserProgressionState } from "./visibility.js";

const defaultWindows: AvailabilityWindow[] = ["now", "anytime"];
const AVAILABLE = [...DEFAULT_AVAILABILITY_WINDOWS];
const EVERYTHING = [...AVAILABILITY_WINDOWS];
const TIMELY: AvailabilityWindow[] = ["now"];

const repairQuest = "repair_the_general_store" as QuestId;

/** Real progression lists every quest; the fixture's only quest starts out of reach. */
function progression(overrides: Partial<UserProgressionState> = {}): UserProgressionState {
  return {
    hasUpperFloor: false,
    heartLevels: {},
    isDating: false,
    knownVillagers: new Set(),
    marriedVillager: null,
    mineFloor: 0,
    questVisibility: { [repairQuest]: "unavailable" },
    reachedSeason: "spring",
    renown: 0,
    showSpoilers: false,
    skillLevels: {},
    unlockedPerks: new Set(),
    ...overrides,
  };
}

function context(
  season: Season = "spring",
  overrides: Partial<UserProgressionState> = {},
  weather: Weather = "calm",
): RowWindowContext {
  return { progressionState: progression(overrides), worldState: { season, weather } };
}

const spring = context();

function src(availability?: AvailabilityCondition, visibility?: VisibilityCondition): Source {
  return {
    ...(availability ? { availability } : {}),
    ...(visibility ? { visibility } : {}),
    type: "store",
    storeId: "test" as StoreId,
  };
}

function row(sources: Source[], visibility?: VisibilityCondition): WindowedRow {
  return { sources, ...(visibility ? { visibility } : {}) };
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
const repairGate: AvailabilityCondition = {
  type: "quest",
  questId: repairQuest,
  state: "completed",
};
const repairVisibility: VisibilityCondition = { type: "questCompleted", questId: repairQuest };

// ─── classifySourceAvailability ─────────────────────────────────────

describe("classifySourceAvailability", () => {
  describe("rule 1: a spoiler-hidden source is later", () => {
    it("classifies a source whose visibility is unmet as later", () => {
      expect(classifySourceAvailability(src(undefined, repairVisibility), spring)).toBe("later");
    });

    it("stops applying once spoilers are shown", () => {
      const shown = context("spring", { showSpoilers: true });
      expect(classifySourceAvailability(src(undefined, repairVisibility), shown)).toBe("anytime");
    });

    it("still applies an unmet gate when spoilers are shown", () => {
      const shown = context("spring", { showSpoilers: true });
      expect(classifySourceAvailability(src(repairGate, repairVisibility), shown)).toBe("later");
    });
  });

  describe("rule 2: an unmet progress gate is later", () => {
    const gates: [string, AvailabilityCondition, Partial<UserProgressionState>][] = [
      ["reachedSeason", { type: "reachedSeason", season: "summer" }, { reachedSeason: "summer" }],
      ["quest", repairGate, { questVisibility: { [repairQuest]: "completed" } }],
      [
        "heartLevel",
        { type: "heartLevel", level: 4, villagerId: "adeline" as VillagerId },
        { heartLevels: { ["adeline" as VillagerId]: 4 } },
      ],
      [
        "skillLevel",
        { type: "skillLevel", level: 5, skillId: "fishing" as SkillId },
        { skillLevels: { ["fishing" as SkillId]: 5 } },
      ],
      ["mineFloor", { type: "mineFloor", floor: 20 }, { mineFloor: 20 }],
      [
        "perkUnlocked",
        { type: "perkUnlocked", perkId: "green_thumb" as PerkId },
        { unlockedPerks: new Set(["green_thumb" as PerkId]) },
      ],
      ["hasUpperFloor", { type: "hasUpperFloor" }, { hasUpperFloor: true }],
      ["isDating", { type: "isDating" }, { isDating: true }],
    ];

    it.each(gates)(
      "classifies an unmet %s gate as later, and a met one as anytime",
      (_, gate, met) => {
        expect(classifySourceAvailability(src(gate), spring)).toBe("later");
        expect(classifySourceAvailability(src(gate), context("spring", met))).toBe("anytime");
      },
    );

    it("treats an unrecorded skill or heart level as zero", () => {
      const fishing: AvailabilityCondition = {
        type: "skillLevel",
        level: 1,
        skillId: "fishing" as SkillId,
      };
      expect(classifySourceAvailability(src(fishing), context("spring", { skillLevels: {} }))).toBe(
        "later",
      );
    });

    it("treats a quest that is only available as an unmet completion gate", () => {
      const available = context("spring", { questVisibility: { [repairQuest]: "available" } });
      expect(classifySourceAvailability(src(repairGate), available)).toBe("later");
    });

    it("keeps a gated source with a met season window now", () => {
      const gated: AvailabilityCondition = {
        type: "all",
        conditions: [seasonCondition(["spring"]), repairGate],
      };
      const repaired = context("spring", { questVisibility: { [repairQuest]: "completed" } });
      expect(classifySourceAvailability(src(gated), repaired)).toBe("now");
      expect(classifySourceAvailability(src(gated), spring)).toBe("later");
    });

    it("counts a gate that only offers an alternative to a season as unrestricted once met", () => {
      const either: AvailabilityCondition = {
        type: "any",
        conditions: [seasonCondition(["spring"]), { type: "mineFloor", floor: 20 }],
      };
      expect(classifySourceAvailability(src(either), context("summer"))).toBe("later");
      expect(classifySourceAvailability(src(either), spring)).toBe("now");
      expect(classifySourceAvailability(src(either), context("summer", { mineFloor: 20 }))).toBe(
        "anytime",
      );
    });
  });

  describe("ignored leaves never hide a met alternative to a season", () => {
    const springOrFloor: AvailabilityCondition = {
      type: "any",
      conditions: [seasonCondition(["spring"]), { type: "mineFloor", floor: 20 }],
    };
    const ignored: AvailabilityCondition[] = [
      timeCondition(1800, 2400),
      { type: "gamePredicate", predicate: "baby_is_due", value: true },
      { type: "dateUnlocked" },
    ];

    it.each(ignored)("classifies a met alternative alongside %o as anytime", (leaf) => {
      const condition: AvailabilityCondition = { type: "all", conditions: [springOrFloor, leaf] };
      expect(classifySourceAvailability(src(condition), context("winter", { mineFloor: 20 }))).toBe(
        "anytime",
      );
      expect(classifySourceAvailability(src(condition), spring)).toBe("now");
      expect(classifySourceAvailability(src(condition), context("winter"))).toBe("later");
    });
  });

  describe("gates the app can't evaluate count as met", () => {
    const unknowable: AvailabilityCondition[] = [
      { type: "gamePredicate", predicate: "baby_is_due", value: true },
      { type: "dateUnlocked" },
      { type: "not", condition: { type: "dateUnlocked" } },
    ];

    it.each(unknowable)("never makes a %o source later", (gate) => {
      expect(classifySourceAvailability(src(gate), spring)).toBe("anytime");
      const seasonal: AvailabilityCondition = {
        type: "all",
        conditions: [seasonCondition(["spring"]), gate],
      };
      expect(classifySourceAvailability(src(seasonal), spring)).toBe("now");
    });
  });

  describe("rule 3: out of season or weather is later", () => {
    it("classifies an out-of-season source as later", () => {
      expect(classifySourceAvailability(src(seasonCondition(["winter"])), spring)).toBe("later");
    });

    it("classifies an out-of-weather source as later", () => {
      const rainy = src(weatherCondition(["inclement"]));
      expect(classifySourceAvailability(rainy, spring)).toBe("later");
      expect(classifySourceAvailability(rainy, context("spring", {}, "inclement"))).toBe("now");
    });
  });

  describe("rule 4: in season is now, unrestricted is anytime", () => {
    it("classifies a matching season as now", () => {
      expect(classifySourceAvailability(src(seasonCondition(["spring"])), spring)).toBe("now");
    });

    it("classifies an unrestricted or all-season source as anytime", () => {
      expect(classifySourceAvailability(src(), spring)).toBe("anytime");
      expect(classifySourceAvailability(src(allSeasonsCondition), spring)).toBe("anytime");
    });
  });

  describe("time of day is never filtered on", () => {
    it("classifies a time-only source as anytime at any time", () => {
      expect(classifySourceAvailability(src(timeCondition(1800, 2400)), spring)).toBe("anytime");
    });

    it("lets a time window ride along with an in-season source", () => {
      const evening: AvailabilityCondition = {
        type: "all",
        conditions: [seasonCondition(["spring"]), timeCondition(1800, 2400)],
      };
      expect(classifySourceAvailability(src(evening), spring)).toBe("now");
    });
  });
});

// ─── classifyItemAvailability ───────────────────────────────────────

describe("classifyItemAvailability", () => {
  it("classifies a row without sources as anytime", () => {
    expect(classifyItemAvailability(row([]), spring)).toBe("anytime");
  });

  it("classifies a spoiler-hidden item as later whatever its sources", () => {
    expect(classifyItemAvailability(row([src()], repairVisibility), spring)).toBe("later");
    expect(classifyItemAvailability(row([], repairVisibility), spring)).toBe("later");
    const shown = context("spring", { showSpoilers: true });
    expect(classifyItemAvailability(row([src()], repairVisibility), shown)).toBe("anytime");
  });

  it("takes the best of its sources: now, then anytime, then later", () => {
    const now = src(seasonCondition(["spring"]));
    const anytime = src();
    const later = src(seasonCondition(["winter"]));
    expect(classifyItemAvailability(row([later, anytime, now]), spring)).toBe("now");
    expect(classifyItemAvailability(row([later, anytime]), spring)).toBe("anytime");
    expect(classifyItemAvailability(row([later, src(repairGate)]), spring)).toBe("later");
  });

  it("counts a spoiler-hidden source as later even when the item is visible", () => {
    const hidden = src(undefined, repairVisibility);
    expect(classifyItemAvailability(row([hidden]), spring)).toBe("later");
    expect(classifyItemAvailability(row([hidden, src(seasonCondition(["spring"]))]), spring)).toBe(
      "now",
    );
  });

  // The issue's worked examples. Balor sells Carrot after the General Store repair, a spoiler gate,
  // and growing it is a spring crop.
  describe("Carrot", () => {
    const balor = src(repairGate, repairVisibility);
    const crop = src(seasonCondition(["spring"]));
    const carrot = row([balor, crop]);
    const repaired = { questVisibility: { [repairQuest]: "completed" as const } };

    it.each([
      ["spring, store not repaired", context("spring"), "later", "now", "now"],
      ["summer, store not repaired", context("summer"), "later", "later", "later"],
      ["summer, store repaired", context("summer", repaired), "anytime", "later", "anytime"],
    ] as const)("%s", (_, ctx, balorWindow, cropWindow, rowWindow) => {
      expect(classifySourceAvailability(balor, ctx)).toBe(balorWindow);
      expect(classifySourceAvailability(crop, ctx)).toBe(cropWindow);
      expect(classifyItemAvailability(carrot, ctx)).toBe(rowWindow);
    });
  });

  // Balor sells Tomato from the first summer, which isn't a spoiler; it's a summer crop.
  describe("Tomato", () => {
    const balor = src({ type: "reachedSeason", season: "summer" });
    const crop = src(seasonCondition(["summer"]));
    const tomato = row([balor, crop]);

    it.each([
      ["spring, year 1", context("spring"), "later", "later", "later"],
      ["summer", context("summer", { reachedSeason: "summer" }), "anytime", "now", "now"],
      [
        "the next spring",
        context("spring", { reachedSeason: "winter" }),
        "anytime",
        "later",
        "anytime",
      ],
    ] as const)("%s", (_, ctx, balorWindow, cropWindow, rowWindow) => {
      expect(classifySourceAvailability(balor, ctx)).toBe(balorWindow);
      expect(classifySourceAvailability(crop, ctx)).toBe(cropWindow);
      expect(classifyItemAvailability(tomato, ctx)).toBe(rowWindow);
    });
  });
});

// ─── isItemAvailable ────────────────────────────────────────────────

describe("isItemAvailable", () => {
  it("available if ANY source passes (OR logic)", () => {
    expect(
      isItemAvailable(
        row([src(seasonCondition(["winter"])), src(seasonCondition(["spring"]))]),
        spring,
        AVAILABLE,
      ),
    ).toBe(true);
  });

  it("unavailable if no source passes", () => {
    expect(isItemAvailable(row([src(seasonCondition(["winter"]))]), spring, AVAILABLE)).toBe(false);
  });

  it("hides a gated row from the default windows", () => {
    expect(isItemAvailable(row([src(repairGate)]), spring, AVAILABLE)).toBe(false);
    expect(isItemAvailable(row([src(repairGate)]), spring, ["later"])).toBe(true);
  });

  it("no sources: available in available mode, hidden in timely mode", () => {
    expect(isItemAvailable(row([]), spring, AVAILABLE)).toBe(true);
    expect(isItemAvailable(row([]), spring, TIMELY)).toBe(false);
  });

  it("everything mode: always available", () => {
    expect(isItemAvailable(row([src(seasonCondition(["winter"]))]), spring, EVERYTHING)).toBe(true);
    expect(isItemAvailable(row([src()], repairVisibility), spring, EVERYTHING)).toBe(true);
  });

  it("supports independently selected windows", () => {
    expect(isItemAvailable(row([src(seasonCondition(["spring"]))]), spring, ["now"])).toBe(true);
    expect(isItemAvailable(row([src()]), spring, ["now"])).toBe(false);
    expect(isItemAvailable(row([src()]), spring, ["anytime"])).toBe(true);
    expect(isItemAvailable(row([src(seasonCondition(["winter"]))]), spring, ["later"])).toBe(true);
    expect(isItemAvailable(row([src(seasonCondition(["winter"]))]), spring, defaultWindows)).toBe(
      false,
    );
  });
});

// ─── isItemDimmed ───────────────────────────────────────────────────

describe("isItemDimmed", () => {
  const laterItem = row([src(seasonCondition(["winter"]))]);

  it("never dims completed items", () => {
    expect(isItemDimmed(laterItem, true, spring, EVERYTHING)).toBe(false);
  });

  it("dims a later item when shown alongside now/anytime windows for contrast", () => {
    expect(isItemDimmed(laterItem, false, spring, EVERYTHING)).toBe(true);
    expect(isItemDimmed(laterItem, false, spring, ["now", "later"])).toBe(true);
  });

  it("dims a gated or spoiler-hidden row like any other later row", () => {
    expect(isItemDimmed(row([src(repairGate)]), false, spring, EVERYTHING)).toBe(true);
    expect(isItemDimmed(row([src()], repairVisibility), false, spring, EVERYTHING)).toBe(true);
  });

  it("does not dim when later is the only selected window", () => {
    expect(isItemDimmed(laterItem, false, spring, ["later"])).toBe(false);
  });

  it("does not dim when later isn't selected at all", () => {
    expect(isItemDimmed(laterItem, false, spring, defaultWindows)).toBe(false);
  });

  it("does not dim items that aren't classified as later", () => {
    expect(isItemDimmed(row([src()]), false, spring, EVERYTHING)).toBe(false);
  });
});

// ─── isInProgressScope ────────────────────────────────────────────────

describe("isInProgressScope", () => {
  it("completed items are always in scope regardless of availability", () => {
    const gated = row([src(repairGate)], repairVisibility);
    expect(isInProgressScope(gated, true, spring, AVAILABLE)).toBe(true);
    expect(isInProgressScope(gated, true, spring, TIMELY)).toBe(true);
    expect(isInProgressScope(gated, true, spring, EVERYTHING)).toBe(true);
  });

  it("incomplete items in scope when available", () => {
    expect(isInProgressScope(row([src()]), false, spring, AVAILABLE)).toBe(true);
  });

  it("incomplete gated items out of scope by default", () => {
    expect(isInProgressScope(row([src(repairGate)]), false, spring, AVAILABLE)).toBe(false);
  });

  it("incomplete items always in scope in everything mode", () => {
    expect(isInProgressScope(row([src(repairGate)]), false, spring, EVERYTHING)).toBe(true);
  });

  it("incomplete items out of scope in timely mode when no sources are timely", () => {
    expect(isInProgressScope(row([]), false, spring, TIMELY)).toBe(false);
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
