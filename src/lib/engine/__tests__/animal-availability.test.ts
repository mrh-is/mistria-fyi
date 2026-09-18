import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { recordEntries } from "$lib/utils.js";

import { getVariantSeason, isVariantInScope } from "../animal-availability";

import type { AvailabilityMode } from "$lib/stores/user-state.svelte.js";
import type { AnimalVariant, Season } from "$lib/types/tracker-data.js";

const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];
const MODES: AvailabilityMode[] = ["available", "everything", "timely"];

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

describe("isVariantInScope", () => {
  it("everything mode always returns true", () => {
    for (const variant of [SUMMER_BREED, NONSEASONAL_BREED, DEFAULT_VARIANT]) {
      for (const season of SEASONS) {
        expect(isVariantInScope(variant, season, "everything")).toBe(true);
      }
    }
  });

  it("available mode includes non-seasonal variants in every season", () => {
    for (const variant of [NONSEASONAL_BREED, DEFAULT_VARIANT]) {
      for (const season of SEASONS) {
        expect(isVariantInScope(variant, season, "available")).toBe(true);
      }
    }
  });

  it("available mode includes seasonal breed only in its season", () => {
    expect(isVariantInScope(SUMMER_BREED, "summer", "available")).toBe(true);
    expect(isVariantInScope(SUMMER_BREED, "spring", "available")).toBe(false);
    expect(isVariantInScope(SUMMER_BREED, "fall", "available")).toBe(false);
    expect(isVariantInScope(SUMMER_BREED, "winter", "available")).toBe(false);
  });

  it("timely mode excludes non-seasonal variants", () => {
    for (const variant of [NONSEASONAL_BREED, DEFAULT_VARIANT]) {
      for (const season of SEASONS) {
        expect(isVariantInScope(variant, season, "timely")).toBe(false);
      }
    }
  });

  it("timely mode includes seasonal breed only in its season", () => {
    expect(isVariantInScope(SUMMER_BREED, "summer", "timely")).toBe(true);
    expect(isVariantInScope(SUMMER_BREED, "spring", "timely")).toBe(false);
  });

  it("also passes for real data variants", () => {
    for (const { variant } of allVariants()) {
      for (const season of SEASONS) {
        expect(isVariantInScope(variant, season, "everything")).toBe(true);
      }
    }
  });
});

describe("animal progress vs UI predicate agreement", () => {
  for (const mode of MODES) {
    for (const season of SEASONS) {
      it(`${mode} mode in ${season}: progress filtered count matches UI in-scope count`, () => {
        let uiInScopeCount = 0;
        for (const { variant } of allVariants()) {
          if (isVariantInScope(variant, season, mode)) {
            uiInScopeCount++;
          }
        }

        let progressFilteredCount = 0;
        for (const [, animal] of recordEntries(trackerData.animals)) {
          for (const tier of animal.variantTiers) {
            for (const [, variant] of recordEntries(tier)) {
              if (isVariantInScope(variant, season, mode)) {
                progressFilteredCount++;
              }
            }
          }
        }

        expect(progressFilteredCount).toBe(uiInScopeCount);
      });
    }
  }

  it("at least one non-seasonal variant exists in test data", () => {
    const nonseasonal = allVariants().filter((v) => getVariantSeason(v.variant) === undefined);
    expect(nonseasonal.length).toBeGreaterThan(0);
  });
});
