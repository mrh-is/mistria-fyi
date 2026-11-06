import { describe, expect, it } from "vitest";

import { applySaveDay } from "./world-state.js";

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
