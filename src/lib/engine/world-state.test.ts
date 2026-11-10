import { describe, expect, it } from "vitest";

import { applySaveDay, rebaseWorldDay } from "./world-state.js";

describe("applySaveDay", () => {
  const world = { season: "spring", weather: "special" } as const;

  it("takes both values from the save", () => {
    expect(applySaveDay(world, { season: "fall", weather: "inclement" })).toEqual({
      season: "fall",
      weather: "inclement",
    });
  });

  it("keeps each value the save left unreadable", () => {
    expect(applySaveDay(world, { season: undefined, weather: undefined })).toEqual(world);
    expect(applySaveDay(world, { season: "fall", weather: undefined })).toEqual({
      season: "fall",
      weather: "special",
    });
  });

  it("clears kept weather the new season can't have", () => {
    expect(applySaveDay(world, { season: "winter", weather: undefined })).toEqual({
      season: "winter",
      weather: "calm",
    });
  });
});

it("keeps a concurrent save date through a weather edit and drops it on a season edit", () => {
  const before = { day: 1, season: "spring", weather: "calm" } as const;
  const stored = { day: 10, season: "fall", weather: "calm" } as const;
  expect(rebaseWorldDay(stored, before, { ...before, weather: "inclement" })).toEqual({
    ...stored,
    weather: "inclement",
  });
  const switched = applySaveDay(before, { season: "summer", weather: undefined });
  expect(rebaseWorldDay(stored, before, switched)).toEqual({
    season: "summer",
    weather: "calm",
  });
});
