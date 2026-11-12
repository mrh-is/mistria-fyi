import { describe, expect, it } from "vitest";

import {
  getDisplayBadges,
  getSourceDisclosure,
  isDoableToday,
  isRowShown,
  isSourceDoable,
} from "./availability.js";

import type { AvailabilityCondition, Source } from "#lib/types/acquisition.js";
import type {
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

import type { AvailabilityRow, DayContext } from "./availability.js";
import type { UserProgressionState } from "./visibility.js";

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
): DayContext {
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

function row(sources: Source[], visibility?: VisibilityCondition): AvailabilityRow {
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

// ─── isSourceDoable ─────────────────────────────────────

describe("isSourceDoable", () => {
  describe("rule 1: a locked source isn't doable", () => {
    it("classifies a source whose visibility is unmet as later", () => {
      expect(isSourceDoable(src(undefined, repairVisibility), spring)).toBe(false);
    });

    it("classifies a source with an unmet reveal gate as later", () => {
      const balor = src(
        { type: "reachedSeason", season: "summer" },
        { type: "reachedSeason", season: "summer" },
      );
      expect(isSourceDoable(balor, spring)).toBe(false);
      expect(isSourceDoable(balor, context("summer", { reachedSeason: "summer" }))).toBe(true);
    });

    it("stops applying once spoilers are shown", () => {
      const shown = context("spring", { showSpoilers: true });
      expect(isSourceDoable(src(undefined, repairVisibility), shown)).toBe(true);
    });

    it("still applies an unmet gate when spoilers are shown", () => {
      const shown = context("spring", { showSpoilers: true });
      expect(isSourceDoable(src(repairGate, repairVisibility), shown)).toBe(false);
    });
  });

  describe("source disclosure", () => {
    it("returns only visible sources and counts each hidden source independently", () => {
      const visible = src();
      const hidden = src(undefined, repairVisibility);
      expect(getSourceDisclosure([visible, hidden, hidden], spring.progressionState)).toEqual({
        hiddenCount: 2,
        visibleSources: [visible],
      });
    });

    it("reveals hidden sources only when their own gate is met or spoilers are shown", () => {
      const hidden = src(undefined, repairVisibility);
      const repaired = context("spring", { questVisibility: { [repairQuest]: "completed" } });
      const spoilers = context("spring", { showSpoilers: true });
      expect(getSourceDisclosure([hidden], repaired.progressionState)).toEqual({
        hiddenCount: 0,
        visibleSources: [hidden],
      });
      expect(getSourceDisclosure([hidden], spoilers.progressionState)).toEqual({
        hiddenCount: 0,
        visibleSources: [hidden],
      });
    });
  });

  describe("rule 2: an unmet progress gate isn't doable", () => {
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
        expect(isSourceDoable(src(gate), spring)).toBe(false);
        expect(isSourceDoable(src(gate), context("spring", met))).toBe(true);
      },
    );

    it("treats an unrecorded skill or heart level as zero", () => {
      const fishing: AvailabilityCondition = {
        type: "skillLevel",
        level: 1,
        skillId: "fishing" as SkillId,
      };
      expect(isSourceDoable(src(fishing), context("spring", { skillLevels: {} }))).toBe(false);
    });

    it("treats a quest that is only available as an unmet completion gate", () => {
      const available = context("spring", { questVisibility: { [repairQuest]: "available" } });
      expect(isSourceDoable(src(repairGate), available)).toBe(false);
    });

    it("keeps a gated source with a met season window now", () => {
      const gated: AvailabilityCondition = {
        type: "all",
        conditions: [seasonCondition(["spring"]), repairGate],
      };
      const repaired = context("spring", { questVisibility: { [repairQuest]: "completed" } });
      expect(isSourceDoable(src(gated), repaired)).toBe(true);
      expect(isSourceDoable(src(gated), spring)).toBe(false);
    });

    it("counts a gate that only offers an alternative to a season as unrestricted once met", () => {
      const either: AvailabilityCondition = {
        type: "any",
        conditions: [seasonCondition(["spring"]), { type: "mineFloor", floor: 20 }],
      };
      expect(isSourceDoable(src(either), context("summer"))).toBe(false);
      expect(isSourceDoable(src(either), spring)).toBe(true);
      expect(isSourceDoable(src(either), context("summer", { mineFloor: 20 }))).toBe(true);
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
      expect(isSourceDoable(src(condition), context("winter", { mineFloor: 20 }))).toBe(true);
      expect(isSourceDoable(src(condition), spring)).toBe(true);
      expect(isSourceDoable(src(condition), context("winter"))).toBe(false);
    });
  });

  describe("gates the app can't evaluate count as met", () => {
    const unknowable: AvailabilityCondition[] = [
      { type: "gamePredicate", predicate: "baby_is_due", value: true },
      { type: "dateUnlocked" },
      { type: "not", condition: { type: "dateUnlocked" } },
    ];

    it.each(unknowable)("never makes a %o source later", (gate) => {
      expect(isSourceDoable(src(gate), spring)).toBe(true);
      const seasonal: AvailabilityCondition = {
        type: "all",
        conditions: [seasonCondition(["spring"]), gate],
      };
      expect(isSourceDoable(src(seasonal), spring)).toBe(true);
    });
  });

  describe("rule 3: out of season or weather isn't doable", () => {
    it("classifies an out-of-season source as later", () => {
      expect(isSourceDoable(src(seasonCondition(["winter"])), spring)).toBe(false);
    });

    it("classifies an out-of-weather source as later", () => {
      const rainy = src(weatherCondition(["inclement"]));
      expect(isSourceDoable(rainy, spring)).toBe(false);
      expect(isSourceDoable(rainy, context("spring", {}, "inclement"))).toBe(true);
    });
  });

  describe("rule 4: in season or unrestricted is doable", () => {
    it("classifies a matching season as now", () => {
      expect(isSourceDoable(src(seasonCondition(["spring"])), spring)).toBe(true);
    });

    it("classifies an unrestricted or all-season source as anytime", () => {
      expect(isSourceDoable(src(), spring)).toBe(true);
      expect(isSourceDoable(src(allSeasonsCondition), spring)).toBe(true);
    });
  });

  describe("time of day is never filtered on", () => {
    it("classifies a time-only source as anytime at any time", () => {
      expect(isSourceDoable(src(timeCondition(1800, 2400)), spring)).toBe(true);
    });

    it("lets a time window ride along with an in-season source", () => {
      const evening: AvailabilityCondition = {
        type: "all",
        conditions: [seasonCondition(["spring"]), timeCondition(1800, 2400)],
      };
      expect(isSourceDoable(src(evening), spring)).toBe(true);
    });
  });
});

// ─── isDoableToday ───────────────────────────────────────

describe("isDoableToday", () => {
  it("treats a row without sources as doable", () => {
    expect(isDoableToday(row([]), spring)).toBe(true);
  });

  it("never counts a locked row, whatever its sources", () => {
    expect(isDoableToday(row([src()], repairVisibility), spring)).toBe(false);
    expect(isDoableToday(row([], repairVisibility), spring)).toBe(false);
    const shown = context("spring", { showSpoilers: true });
    expect(isDoableToday(row([src()], repairVisibility), shown)).toBe(true);
  });

  it("is doable through any one source", () => {
    const now = src(seasonCondition(["spring"]));
    const anytime = src();
    const later = src(seasonCondition(["winter"]));
    expect(isDoableToday(row([later, anytime, now]), spring)).toBe(true);
    expect(isDoableToday(row([later, anytime]), spring)).toBe(true);
    expect(isDoableToday(row([later, src(repairGate)]), spring)).toBe(false);
  });

  it("skips a locked source even when the row is unlocked", () => {
    const hidden = src(undefined, repairVisibility);
    expect(isDoableToday(row([hidden]), spring)).toBe(false);
    expect(isDoableToday(row([hidden, src(seasonCondition(["spring"]))]), spring)).toBe(true);
  });

  // The issue's worked examples. Balor sells Carrot after the General Store repair, a spoiler gate,
  // and growing it is a spring crop.
  describe("Carrot", () => {
    const balor = src(repairGate, repairVisibility);
    const crop = src(seasonCondition(["spring"]));
    const carrot = row([balor, crop]);
    const repaired = { questVisibility: { [repairQuest]: "completed" as const } };

    it.each([
      ["spring, store not repaired", context("spring"), false, true, true],
      ["summer, store not repaired", context("summer"), false, false, false],
      ["summer, store repaired", context("summer", repaired), true, false, true],
    ] as const)("%s", (_, ctx, balorDoable, cropDoable, rowDoable) => {
      expect(isSourceDoable(balor, ctx)).toBe(balorDoable);
      expect(isSourceDoable(crop, ctx)).toBe(cropDoable);
      expect(isDoableToday(carrot, ctx)).toBe(rowDoable);
    });
  });

  // Balor sells Tomato from the first summer, which isn't a spoiler; it's a summer crop.
  describe("Tomato", () => {
    const balor = src({ type: "reachedSeason", season: "summer" });
    const crop = src(seasonCondition(["summer"]));
    const tomato = row([balor, crop]);

    it.each([
      ["spring, year 1", context("spring"), false, false, false],
      ["summer", context("summer", { reachedSeason: "summer" }), true, true, true],
      ["the next spring", context("spring", { reachedSeason: "winter" }), true, false, true],
    ] as const)("%s", (_, ctx, balorDoable, cropDoable, rowDoable) => {
      expect(isSourceDoable(balor, ctx)).toBe(balorDoable);
      expect(isSourceDoable(crop, ctx)).toBe(cropDoable);
      expect(isDoableToday(tomato, ctx)).toBe(rowDoable);
    });
  });
});

describe("isDoableToday with source filters", () => {
  const shop: Source = { ...src(), type: "store", storeId: "shop" as StoreId };
  const springCatch = src(seasonCondition(["spring"]));
  const onlyCatching = (source: Source): boolean => source === springCatch;

  it("counts a row only through the sources the filters show", () => {
    const ladybug = row([springCatch, shop]);
    expect(isDoableToday(ladybug, context("summer"))).toBe(true);
    expect(isDoableToday(ladybug, context("summer"), onlyCatching)).toBe(false);
    expect(isDoableToday(ladybug, context("spring"), onlyCatching)).toBe(true);
  });

  it("isn't doable when the filters show none of its sources", () => {
    expect(isDoableToday(row([shop]), spring, onlyCatching)).toBe(false);
  });

  it("keeps a row without sources doable under any filter", () => {
    expect(isDoableToday(row([]), spring, () => false)).toBe(true);
  });
});

describe("isRowShown", () => {
  it("shows a row with any shown source, or with none at all", () => {
    expect(isRowShown([src()], () => true)).toBe(true);
    expect(isRowShown([src()], () => false)).toBe(false);
    expect(isRowShown([], () => false)).toBe(true);
  });
});

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
