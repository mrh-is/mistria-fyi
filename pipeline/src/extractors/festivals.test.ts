import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { extractFestivals } from "./festivals.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return overrides as ParsedGameData;
}

describe("extractFestivals", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts festival names in sorted key order and skips entries without valid data", () => {
    const fiddle = makeFiddle({
      festivals: {
        missing_name: { description: "No name" },
        null_entry: null,
        numeric_name: { name: 42 },
        spring_festival: { name: "Spring Festival" },
        string_entry: "Not an object",
        winter_festival: { name: "Winter Festival" },
      },
    });

    const festivals = extractFestivals(fiddle);

    expect(festivals).toEqual({
      spring_festival: { name: "Spring Festival" },
      winter_festival: { name: "Winter Festival" },
    });
    expect(Object.keys(festivals)).toEqual(["spring_festival", "winter_festival"]);
  });

  it("skips the default key", () => {
    const fiddle = makeFiddle({
      festivals: {
        default: { name: "Default Festival" },
        spring_festival: { name: "Spring Festival" },
      },
    });

    expect(extractFestivals(fiddle)).toEqual({
      spring_festival: { name: "Spring Festival" },
    });
  });

  it("returns an empty object when there is no festivals data", () => {
    expect(extractFestivals(makeFiddle())).toEqual({});
  });
});
