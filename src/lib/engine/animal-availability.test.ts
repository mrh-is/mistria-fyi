import { describe, expect, it } from "vitest";

import { trackerData } from "#lib/data/index.js";
import { deriveProgressionState } from "#lib/engine/visibility.js";
import { makeCompletedState } from "#lib/test-utils/completed-state.js";
import { AVAILABILITY_WINDOWS, DEFAULT_AVAILABILITY_WINDOWS } from "#lib/types/availability.js";
import { recordEntries } from "#lib/utils/record.js";

import {
  getVariantSeason,
  isVariantInScope as isVariantInScopeEngine,
} from "./animal-availability.js";

import type { AvailabilityWindow } from "#lib/types/availability.js";
import type { AnimalVariant, QuestId, Season } from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

/** Window selections named for the retired availability modes, kept as test presets. */
const WINDOW_PRESETS = {
  available: DEFAULT_AVAILABILITY_WINDOWS,
  everything: AVAILABILITY_WINDOWS,
  timely: ["now"],
} satisfies Record<string, readonly AvailabilityWindow[]>;
type WindowPreset = keyof typeof WINDOW_PRESETS;

const SEASONS: Season[] = ["spring", "summer", "fall", "winter"];
const MODES: WindowPreset[] = ["available", "everything", "timely"];
const AVAILABLE = [...DEFAULT_AVAILABILITY_WINDOWS];
const EVERYTHING = [...AVAILABILITY_WINDOWS];
const TIMELY: AvailabilityWindow[] = ["now"];

const progressionState = deriveProgressionState(makeCompletedState(), trackerData, false);

/** Scope for a variant of an always-visible species, in a fresh game's progression. */
function isVariantInScope(
  variant: AnimalVariant,
  season: Season,
  windows: readonly AvailabilityWindow[],
  animalVisibility?: VisibilityCondition,
): boolean {
  return isVariantInScopeEngine(
    variant,
    animalVisibility,
    { progressionState, worldState: { season, weather: "calm" } },
    windows,
  );
}

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
        expect(isVariantInScope(variant, season, EVERYTHING)).toBe(true);
      }
    }
  });

  it("available mode includes non-seasonal variants in every season", () => {
    for (const variant of [NONSEASONAL_BREED, DEFAULT_VARIANT]) {
      for (const season of SEASONS) {
        expect(isVariantInScope(variant, season, AVAILABLE)).toBe(true);
      }
    }
  });

  it("available mode includes seasonal breed only in its season", () => {
    expect(isVariantInScope(SUMMER_BREED, "summer", AVAILABLE)).toBe(true);
    expect(isVariantInScope(SUMMER_BREED, "spring", AVAILABLE)).toBe(false);
    expect(isVariantInScope(SUMMER_BREED, "fall", AVAILABLE)).toBe(false);
    expect(isVariantInScope(SUMMER_BREED, "winter", AVAILABLE)).toBe(false);
  });

  it("timely mode excludes non-seasonal variants", () => {
    for (const variant of [NONSEASONAL_BREED, DEFAULT_VARIANT]) {
      for (const season of SEASONS) {
        expect(isVariantInScope(variant, season, TIMELY)).toBe(false);
      }
    }
  });

  it("timely mode includes seasonal breed only in its season", () => {
    expect(isVariantInScope(SUMMER_BREED, "summer", TIMELY)).toBe(true);
    expect(isVariantInScope(SUMMER_BREED, "spring", TIMELY)).toBe(false);
  });

  it("counts every variant of a spoiler-hidden species as later", () => {
    const hidden: VisibilityCondition = {
      type: "questCompleted",
      questId: "never_completed" as QuestId,
    };
    expect(isVariantInScope(NONSEASONAL_BREED, "spring", AVAILABLE, hidden)).toBe(false);
    expect(isVariantInScope(SUMMER_BREED, "summer", TIMELY, hidden)).toBe(false);
    expect(isVariantInScope(NONSEASONAL_BREED, "spring", ["later"], hidden)).toBe(true);
  });

  it("also passes for real data variants", () => {
    for (const { variant } of allVariants()) {
      for (const season of SEASONS) {
        expect(isVariantInScope(variant, season, EVERYTHING)).toBe(true);
      }
    }
  });
});

describe("animal progress vs UI predicate agreement", () => {
  it.each(MODES.flatMap((mode) => SEASONS.map((season) => [mode, season] as const)))(
    "%s mode in %s: progress filtered count matches UI in-scope count",
    (mode, season) => {
      let uiInScopeCount = 0;
      for (const { variant } of allVariants()) {
        if (isVariantInScope(variant, season, [...WINDOW_PRESETS[mode]])) {
          uiInScopeCount++;
        }
      }

      let progressFilteredCount = 0;
      for (const [, animal] of recordEntries(trackerData.animals)) {
        for (const tier of animal.variantTiers) {
          for (const [, variant] of recordEntries(tier)) {
            if (isVariantInScope(variant, season, [...WINDOW_PRESETS[mode]])) {
              progressFilteredCount++;
            }
          }
        }
      }

      expect(progressFilteredCount).toBe(uiInScopeCount);
    },
  );

  it("at least one non-seasonal variant exists in test data", () => {
    const nonseasonal = allVariants().filter((v) => getVariantSeason(v.variant) === undefined);
    expect(nonseasonal.length).toBeGreaterThan(0);
  });
});
