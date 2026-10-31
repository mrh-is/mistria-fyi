import { describe, expect, it } from "vitest";

import {
  changedFacts,
  confirmedBySave,
  factKey,
  holdsGuess,
  obtainedSourceOf,
  progressFacts,
  resolutionHolds,
} from "./provenance.js";

import type { JsonValue } from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";

import type { FactProvenance } from "./provenance.js";

function progress(overrides: Partial<ProgressState> = {}): ProgressState {
  return {
    almanac: new Set(),
    almanacRecipes: new Set(),
    animalCosmetics: {},
    animals: {},
    breakUpsDisabled: false,
    childChoice: "undeclared",
    cosmetics: new Set(),
    hasUpperFloor: false,
    heartLevels: {},
    mineFloor: 0,
    mountAppearances: new Set(),
    museum: new Set(),
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    spells: new Set(),
    unlockedPerks: new Set(),
    villagerRelationships: {},
    ...overrides,
  };
}

describe("factKey", () => {
  it("joins the field & the IDs that locate the fact", () => {
    expect(factKey("mineFloor")).toBe("mineFloor");
    expect(factKey("almanac", "turnip")).toBe("almanac/turnip");
    expect(factKey("animals", "chicken", "red")).toBe("animals/chicken/red");
  });
});

describe("progressFacts", () => {
  it("is empty at the defaults", () => {
    expect(progressFacts(progress())).toEqual(new Map());
  });

  it("lists every non-default fact with a comparable value", () => {
    const facts = progressFacts(
      progress({
        almanac: new Set(["turnip"]),
        animals: { chicken: new Set(["red"]) },
        childChoice: "no",
        hasUpperFloor: true,
        heartLevels: { balor: 4, celine: 0 },
        mineFloor: 20,
        questStates: { a_birdhouse: "none", repair_the_general_store: "completed" },
        reachedSeason: "fall",
        renown: 17,
        villagerRelationships: { adeline: "undecided", balor: "romantic" },
        // Plain strings stand in for the branded IDs.
      } as unknown as Partial<ProgressState>),
    );

    expect(Object.fromEntries(facts)).toEqual({
      "almanac/turnip": "1",
      "animals/chicken/red": "1",
      childChoice: "no",
      hasUpperFloor: "1",
      "heartLevels/balor": "4",
      mineFloor: "20",
      "questStates/repair_the_general_store": "completed",
      reachedSeason: "fall",
      renown: "17",
      "villagerRelationships/balor": "romantic",
    });
  });
});

describe("changedFacts", () => {
  it("reports ticks, unticks, & changed values, but not unchanged facts", () => {
    const before = new Map([
      ["almanac/turnip", "1"],
      ["heartLevels/balor", "4"],
      ["museum/turnip", "1"],
    ]);
    const after = new Map([
      ["almanac/turnip", "1"],
      ["heartLevels/balor", "5"],
      ["spells/summon_rain", "1"],
    ]);

    expect(changedFacts(before, after).toSorted()).toEqual([
      "heartLevels/balor",
      "museum/turnip",
      "spells/summon_rain",
    ]);
  });
});

describe("obtainedSourceOf", () => {
  it.each(["inferred", "unknown"] as const)("lets a save's finish replace a %s slash", (source) => {
    expect(obtainedSourceOf({ source }, "save", "obtained", "completed")).toBeUndefined();
  });

  it("lets a save's finish replace the slash of a quest with no record", () => {
    expect(obtainedSourceOf(undefined, "save", "obtained", "completed")).toBeUndefined();
  });

  it("keeps a manual slash under a save's finish", () => {
    const previous: FactProvenance = { source: "manual" };
    expect(obtainedSourceOf(previous, "save", "obtained", "completed")).toBe("manual");
  });

  it("keeps a guessed slash under a finish that isn't a save's", () => {
    const previous: FactProvenance = { source: "inferred" };
    expect(obtainedSourceOf(previous, "manual", "obtained", "completed")).toBe("inferred");
    expect(obtainedSourceOf(undefined, "manual", "obtained", "completed")).toBe("unknown");
  });
});

describe("confirmedBySave", () => {
  const PLAYTIME = 100;

  it.each<[string, FactProvenance, FactProvenance]>([
    ["promotes unknown", { source: "unknown" }, { playtime: PLAYTIME, source: "save" }],
    [
      "promotes inferred, replacing its playtime",
      { playtime: 5, source: "inferred" },
      { playtime: PLAYTIME, source: "save" },
    ],
    [
      "promotes a guessed finish over a guessed slash",
      { obtainedSource: "inferred", source: "unknown" },
      { playtime: PLAYTIME, source: "save" },
    ],
    [
      "promotes a guessed finish over a manual slash, keeping the slash",
      { obtainedSource: "manual", source: "unknown" },
      { obtainedSource: "manual", playtime: PLAYTIME, source: "save" },
    ],
    [
      "clears a guessed slash under a save's X, keeping its playtime",
      { obtainedSource: "unknown", playtime: 5, source: "save" },
      { playtime: 5, source: "save" },
    ],
    [
      "stamps a guessed slash under a manual X, keeping the edit's playtime",
      { obtainedSource: "inferred", playtime: 5, source: "manual" },
      { obtainedSource: "save", playtime: 5, source: "manual" },
    ],
  ])("%s", (_name, record, expected) => {
    expect(holdsGuess(record)).toBe(true);
    expect(confirmedBySave(record, PLAYTIME)).toEqual(expected);
  });

  it.each<FactProvenance>([
    { playtime: 5, source: "manual" },
    { playtime: 5, source: "save" },
    { obtainedSource: "save", playtime: 5, source: "manual" },
    { obtainedSource: "manual", playtime: 5, source: "save" },
  ])("holds no guess in %j", (record) => {
    expect(holdsGuess(record)).toBe(false);
    expect(confirmedBySave(record, PLAYTIME)).toEqual(record);
  });

  it("omits the playtime of a save that couldn't be read", () => {
    expect(confirmedBySave({ source: "inferred" }, undefined)).toEqual({ source: "save" });
  });
});

describe("resolutionHolds", () => {
  it("holds while the save reports the value the player declined", () => {
    expect(resolutionHolds({ saveValue: 6 }, 6)).toBe(true);
    const reordered = JSON.parse('{"b":[2],"a":1}') as JsonValue;
    expect(resolutionHolds({ saveValue: { a: 1, b: [2] } }, reordered)).toBe(true);
  });

  it("lapses once the save's value changes, and is absent without a resolution", () => {
    expect(resolutionHolds({ saveValue: 6 }, 7)).toBe(false);
    expect(resolutionHolds({ saveValue: null }, false)).toBe(false);
    expect(resolutionHolds(undefined, 6)).toBe(false);
  });
});
