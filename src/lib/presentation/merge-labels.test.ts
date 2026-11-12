import { describe, expect, it } from "vitest";

import {
  formatMergeCount,
  MERGE_COUNT_LABELS,
  totalMergeCounts,
} from "#lib/presentation/merge-labels.js";

import type { MergeCounts } from "#lib/types/user-progress.js";

function zeroCounts(): MergeCounts {
  return {
    almanac: 0,
    almanacRecipes: 0,
    animalCosmetics: 0,
    animals: 0,
    breakUpsDisabled: 0,
    childChoice: 0,
    cosmetics: 0,
    hasUpperFloor: 0,
    heartLevels: 0,
    mineFloor: 0,
    mountAppearances: 0,
    museum: 0,
    perks: 0,
    petCosmetics: 0,
    petSkins: 0,
    quests: 0,
    reachedSeason: 0,
    renown: 0,
    skillLevels: 0,
    spells: 0,
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
    expect(formatMergeCount("almanac", 0, "en")).toBeNull();
  });

  it("formats a plain count field", () => {
    expect(formatMergeCount("almanac", 5, "en")).toBe("Almanac: +5");
    expect(formatMergeCount("almanac", 1737, "en")).toBe("Almanac: +1,737");
  });

  it("formats a field with a suffix", () => {
    expect(formatMergeCount("mineFloor", 3, "en")).toBe("Mine floor: +3 floors");
    expect(formatMergeCount("mineFloor", 1234, "en")).toBe("Mine floor: +1,234 floors");
    expect(formatMergeCount("mineFloor", 1, "en")).toBe("Mine floor: +1 floor");
  });

  it("uses the supplied locale for both wording and grouped numbers", () => {
    expect(formatMergeCount("almanac", 1737, "fr")).toBe("Catalogue\u00A0: +1\u202F737");
    expect(formatMergeCount("mineFloor", 1234, "fr")).toBe(
      "Étage de mine\u00A0: +1\u202F234 étages",
    );
  });

  it("formats a boolean field without a count prefix", () => {
    expect(formatMergeCount("hasUpperFloor", 1, "en")).toBe("Upper floor unlocked");
    expect(formatMergeCount("reachedSeason", 1, "en")).toBe("Season progression updated");
    expect(formatMergeCount("childChoice", 1, "en")).toBe("Child choice updated");
    expect(formatMergeCount("breakUpsDisabled", 1, "en")).toBe("Break-ups disabled");
  });

  it("returns a label for every previously omitted field when non-zero", () => {
    const previouslyOmitted = [
      "childChoice",
      "hasUpperFloor",
      "villagerRelationships",
      "perks",
      "reachedSeason",
    ] as const;

    for (const field of previouslyOmitted) {
      const result = formatMergeCount(field, 1, "en");
      expect(result, `field "${field}" should produce a non-null label`).toBeTruthy();
      expect((result ?? "").length, `field "${field}" label should be non-empty`).toBeGreaterThan(
        0,
      );
    }
  });
});
