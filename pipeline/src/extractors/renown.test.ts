import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase } from "../test-helpers";
import { extractTownRanks as extractLocalizedTownRanks } from "./renown";

vi.mock("../parse-fiddle", () => ({
  sourceFileFor: () => "mock-source.toml",
}));

vi.mock("../localize", () => ({
  localizeField: vi.fn((_assetsDir: string, input: { englishValue: string }) => ({
    fallbackLocales: [],
    values: { en: input.englishValue },
  })),
}));

function extractTownRanks(fiddle: ReturnType<typeof makeFiddleBase>) {
  const { localeNames, townRanks } = extractLocalizedTownRanks(fiddle, "test-assets");
  return townRanks.map((rank, index) => ({ ...rank, name: localeNames.en[index.toString()] }));
}

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({
    renown: {
      levels_per_rank: 10,
      ranks: [],
    },
    ...overrides,
  });
}

describe("extractTownRanks", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("returns empty array when renown data is absent", () => {
    const fiddle = makeFiddleBase({});
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
      { levels: { start: 0, end: 9 }, name: "Newcomer" },
      { levels: { start: 10, end: 19 }, name: "Resident" },
      { levels: { start: 20, end: 20 }, name: "Citizen" },
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
    expect(result[0].levels).toEqual({ start: 0, end: 4 });
    expect(result[1].levels).toEqual({ start: 5, end: 5 });
  });

  it("defaults to 10 levels per rank when field is missing", () => {
    const fiddle = makeFiddle({
      renown: {
        ranks: [{ name: "Rank A" }, { name: "Rank B" }],
      },
    });

    const result = extractTownRanks(fiddle);
    expect(result[0].levels).toEqual({ start: 0, end: 9 });
    expect(result[1].levels).toEqual({ start: 10, end: 10 });
  });

  it("rejects a rank without an English name", () => {
    const fiddle = makeFiddle({
      renown: {
        levels_per_rank: 10,
        ranks: [{}],
      },
    });

    expect(() => extractTownRanks(fiddle)).toThrow("Town rank at ordinal 0 has no English name");
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
    expect(result[10].levels).toEqual({ start: 100, end: 100 });
    expect(result[10].name).toBe("Rank 11");
  });
});
