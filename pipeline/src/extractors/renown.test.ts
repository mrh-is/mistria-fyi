import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractTownRanks } from "./renown.js";

import type { ParsedGameData } from "../parse-fiddle.js";

vi.mock("../parse-fiddle.js", () => ({
  sourceFileFor: () => "mock-source.toml",
}));

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return {
    renown: {
      levels_per_rank: 10,
      ranks: [],
    },
    ...overrides,
  } as unknown as ParsedGameData;
}

describe("extractTownRanks", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("returns empty array when renown data is absent", () => {
    const fiddle = {} as unknown as ParsedGameData;
    expect(extractTownRanks(fiddle)).toEqual([]);
  });

  it("extracts ranks with level ranges", () => {
    const fiddle = makeFiddle({
      renown: {
        levels_per_rank: 10,
        ranks: [{ name: "Newcomer" }, { name: "Resident" }, { name: "Citizen" }],
      },
    });

    const result = extractTownRanks(fiddle);
    expect(result).toEqual([
      { levels: { start: 1, end: 10 }, name: "Newcomer" },
      { levels: { start: 11, end: 20 }, name: "Resident" },
      { levels: { start: 21, end: 30 }, name: "Citizen" },
    ]);
  });

  it("uses levels_per_rank to compute ranges", () => {
    const fiddle = makeFiddle({
      renown: {
        levels_per_rank: 5,
        ranks: [{ name: "Rank A" }, { name: "Rank B" }],
      },
    });

    const result = extractTownRanks(fiddle);
    expect(result[0].levels).toEqual({ start: 1, end: 5 });
    expect(result[1].levels).toEqual({ start: 6, end: 10 });
  });

  it("defaults to 10 levels per rank when field is missing", () => {
    const fiddle = makeFiddle({
      renown: {
        ranks: [{ name: "Only" }],
      },
    });

    const result = extractTownRanks(fiddle);
    expect(result[0].levels).toEqual({ start: 1, end: 10 });
  });

  it("uses 'Unknown' as name fallback", () => {
    const fiddle = makeFiddle({
      renown: {
        levels_per_rank: 10,
        ranks: [{}],
      },
    });

    const result = extractTownRanks(fiddle);
    expect(result[0].name).toBe("Unknown");
  });

  it("handles many ranks for extended level ranges", () => {
    const fiddle = makeFiddle({
      renown: {
        levels_per_rank: 10,
        ranks: Array.from({ length: 11 }, (_, i) => ({ name: `Rank ${i + 1}` })),
      },
    });

    const result = extractTownRanks(fiddle);
    expect(result).toHaveLength(11);
    expect(result[10].levels).toEqual({ start: 101, end: 110 });
    expect(result[10].name).toBe("Rank 11");
  });
});
