import { describe, expect, it } from "vitest";

import {
  formatMergeCount,
  MERGE_COUNT_LABELS,
  totalMergeCounts,
} from "#lib/engine/merge-labels.js";

import type { MergeCounts } from "#lib/types/user-progress.js";

function zeroCounts(): MergeCounts {
  return {
    almanac: 0,
    almanacRecipes: 0,
    animalCosmetics: 0,
    animals: 0,
    childChoice: 0,
    cosmetics: 0,
    dates: 0,
    hasUpperFloor: 0,
    mineFloor: 0,
    museum: 0,
    perks: 0,
    petCosmetics: 0,
    petSkins: 0,
    quests: 0,
    reachedSeason: 0,
    renown: 0,
    skillLevels: 0,
    spells: 0,
    villagerLevels: 0,
    villagerRelationships: 0,
  };
}

describe("MERGE_COUNT_LABELS", () => {
  it("covers every key in MergeCounts", () => {
    const labelKeys = Object.keys(MERGE_COUNT_LABELS).toSorted();
    const countKeys = Object.keys(zeroCounts()).toSorted();
    expect(labelKeys).toEqual(countKeys);
  });
});

describe("totalMergeCounts", () => {
  it("returns zero for all-zero counts", () => {
    expect(totalMergeCounts(zeroCounts())).toBe(0);
  });

  it("sums all fields including previously omitted ones", () => {
    const counts = zeroCounts();
    counts.perks = 3;
    expect(totalMergeCounts(counts)).toBe(3);
  });

  it("includes every previously omitted field in the total", () => {
    const previouslyOmitted = [
      "childChoice",
      "dates",
      "hasUpperFloor",
      "villagerRelationships",
      "perks",
      "reachedSeason",
    ] as const;

    for (const field of previouslyOmitted) {
      const counts = zeroCounts();
      counts[field] = 1;
      expect(totalMergeCounts(counts), `field "${field}" should contribute to total`).toBe(1);
    }
  });
});

describe("formatMergeCount", () => {
  it("returns null for zero count", () => {
    expect(formatMergeCount("almanac", 0)).toBeNull();
  });

  it("formats a plain count field", () => {
    expect(formatMergeCount("almanac", 5)).toBe("Almanac: +5");
  });

  it("formats a field with a suffix", () => {
    expect(formatMergeCount("mineFloor", 3)).toBe("Mine floor: +3 floors");
  });

  it("formats a boolean field without a count prefix", () => {
    expect(formatMergeCount("hasUpperFloor", 1)).toBe("Upper floor unlocked");
    expect(formatMergeCount("reachedSeason", 1)).toBe("Season progression updated");
    expect(formatMergeCount("childChoice", 1)).toBe("Child choice updated");
  });

  it("returns a label for every previously omitted field when non-zero", () => {
    const previouslyOmitted = [
      "childChoice",
      "dates",
      "hasUpperFloor",
      "villagerRelationships",
      "perks",
      "reachedSeason",
    ] as const;

    for (const field of previouslyOmitted) {
      const result = formatMergeCount(field, 1);
      expect(result, `field "${field}" should produce a non-null label`).toBeTruthy();
      expect((result ?? "").length, `field "${field}" label should be non-empty`).toBeGreaterThan(
        0,
      );
    }
  });
});
