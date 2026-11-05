import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { recordEntries } from "#lib/utils/record.js";

import { getVariantSeason } from "./animal-availability.js";

import type { AnimalVariant } from "#lib/types/tracker-data.js";

const SUMMER_BREED: AnimalVariant = {
  source: { type: "breed", availability: { type: "season", seasons: ["summer"] } },
};
const NONSEASONAL_BREED: AnimalVariant = {
  source: { type: "breed" },
};
const DEFAULT_VARIANT: AnimalVariant = {
  source: { type: "default" },
};

function allVariants(): { animalId: string; variant: AnimalVariant; variantId: string }[] {
  const results: { animalId: string; variant: AnimalVariant; variantId: string }[] = [];
  for (const [animalId, animal] of recordEntries(trackerData.animals)) {
    for (const tier of animal.variantTiers) {
      for (const [variantId, variant] of recordEntries(tier)) {
        results.push({ animalId, variant, variantId });
      }
    }
  }
  return results;
}

describe("getVariantSeason", () => {
  it("returns undefined for default-type variants", () => {
    expect(getVariantSeason(DEFAULT_VARIANT)).toBeUndefined();
  });

  it("returns undefined for breed variants without seasonal availability", () => {
    expect(getVariantSeason(NONSEASONAL_BREED)).toBeUndefined();
  });

  it("returns the first season for seasonal breed variants", () => {
    expect(getVariantSeason(SUMMER_BREED)).toBe("summer");
  });
});

describe("animal variants in the tracker data", () => {
  it("at least one non-seasonal variant exists in test data", () => {
    const nonseasonal = allVariants().filter((v) => getVariantSeason(v.variant) === undefined);
    expect(nonseasonal.length).toBeGreaterThan(0);
  });
});
