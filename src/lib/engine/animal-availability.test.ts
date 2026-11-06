import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { recordEntries } from "#lib/utils/record.js";

import { getVariantSeason, isAnimalVariantSpoilered } from "./animal-availability.js";

import type { AnimalVariant, AnimalVariantId } from "#lib/types/tracker-data.js";

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

describe("isAnimalVariantSpoilered", () => {
  const tiered = recordEntries(trackerData.animals).find(
    ([, animal]) => animal.variantTiers.length > 1,
  );
  if (!tiered) throw new Error("No animal has more than one variant tier");
  const [animalId, animal] = tiered;
  const tierIds = animal.variantTiers.map((tier) => Object.keys(tier) as AnimalVariantId[]);

  it("opens the first tier before anything is collected", () => {
    for (const variantId of tierIds[0]) {
      expect(isAnimalVariantSpoilered(animalId, variantId, undefined, false)).toBe(false);
    }
  });

  it("keeps the second tier closed until the first has a find", () => {
    expect(isAnimalVariantSpoilered(animalId, tierIds[1][0], undefined, false)).toBe(true);
    expect(isAnimalVariantSpoilered(animalId, tierIds[1][0], new Set([tierIds[0][0]]), false)).toBe(
      false,
    );
  });

  it("reveals everything with spoilers on", () => {
    for (const variantId of tierIds.flat()) {
      expect(isAnimalVariantSpoilered(animalId, variantId, undefined, true)).toBe(false);
    }
  });
});
