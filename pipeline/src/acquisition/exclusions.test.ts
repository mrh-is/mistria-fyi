import { describe, expect, it } from "vitest";

import {
  applyExclusions,
  COSMETIC_EXCLUSIONS,
  getExcludedCosmeticIds,
  isExcludedCosmetic,
  validateExclusionReferences,
} from "./exclusions";

import type { CosmeticId } from "$lib/types/tracker-data.js";

describe("cosmetic exclusions", () => {
  describe("exclusion table", () => {
    it("every exclusion has an id, reason, and evidence", () => {
      for (const exclusion of COSMETIC_EXCLUSIONS) {
        expect(exclusion.id).toBeTruthy();
        expect(exclusion.reason).toBeTruthy();
        expect(exclusion.evidence).toBeTruthy();
      }
    });

    it("excludes 24 baby_back cosmetics", () => {
      const babyBacks = COSMETIC_EXCLUSIONS.filter((e) => e.id.startsWith("baby_back_"));
      expect(babyBacks).toHaveLength(24);
    });

    it("excludes 5 Seridia armor cosmetics", () => {
      const seridia = COSMETIC_EXCLUSIONS.filter((e) => e.id.endsWith("_seridia"));
      expect(seridia).toHaveLength(5);
    });

    it("excludes head_flower_hat and back_gear_march_mistrian_shield", () => {
      expect(isExcludedCosmetic("head_flower_hat" as CosmeticId)).toBe(true);
      expect(isExcludedCosmetic("back_gear_march_mistrian_shield" as CosmeticId)).toBe(true);
    });

    it("does not exclude player-obtainable cosmetics", () => {
      expect(isExcludedCosmetic("head_mimic_hat" as CosmeticId)).toBe(false);
      expect(isExcludedCosmetic("back_gear_dragonsworn_cloak" as CosmeticId)).toBe(false);
    });

    it("has no duplicate IDs", () => {
      const ids = COSMETIC_EXCLUSIONS.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("total exclusion count is 31", () => {
      expect(COSMETIC_EXCLUSIONS).toHaveLength(31);
    });
  });

  describe("applyExclusions", () => {
    it("removes excluded cosmetics from a registry", () => {
      const registry = {
        ["baby_back_astrid_darker" as CosmeticId]: { name: "" },
        ["head_mimic_hat" as CosmeticId]: { name: "Mimic Hat" },
      };

      const result = applyExclusions(registry);
      expect(result).not.toHaveProperty("baby_back_astrid_darker");
      expect(result).toHaveProperty("head_mimic_hat");
    });

    it("does not mutate the input", () => {
      const registry = {
        ["baby_back_astrid_darker" as CosmeticId]: { name: "" },
      };

      applyExclusions(registry);
      expect(registry).toHaveProperty("baby_back_astrid_darker");
    });
  });

  describe("getExcludedCosmeticIds", () => {
    it("returns a set matching the exclusion table", () => {
      const ids = getExcludedCosmeticIds();
      expect(ids.size).toBe(COSMETIC_EXCLUSIONS.length);
      for (const exclusion of COSMETIC_EXCLUSIONS) {
        expect(ids.has(exclusion.id)).toBe(true);
      }
    });
  });

  describe("validateExclusionReferences", () => {
    it("returns empty diagnostics when no references exist", () => {
      const result = validateExclusionReferences(undefined, undefined, undefined, undefined);
      expect(result).toHaveLength(0);
    });

    it("rejects an excluded cosmetic referenced in an almanac category", () => {
      const almanac = [{ items: { baby_back_astrid_darker: {} } }];
      const result = validateExclusionReferences(almanac, undefined, undefined, undefined);
      expect(result).toHaveLength(1);
      expect(result[0].excludedId).toBe("baby_back_astrid_darker");
      expect(result[0].referencePath).toContain("almanac");
    });

    it("rejects an excluded cosmetic referenced in a museum set", () => {
      const museum = [{ sets: [{ items: ["head_flower_hat"] }] }];
      const result = validateExclusionReferences(undefined, museum, undefined, undefined);
      expect(result).toHaveLength(1);
      expect(result[0].excludedId).toBe("head_flower_hat");
    });

    it("rejects an excluded cosmetic referenced as a recipe member", () => {
      const recipes = {
        some_recipe: { memberItemIds: ["baby_back_brid_darker"] },
      };
      const result = validateExclusionReferences(undefined, undefined, recipes, undefined);
      expect(result).toHaveLength(1);
      expect(result[0].excludedId).toBe("baby_back_brid_darker");
    });

    it("rejects an excluded cosmetic with accumulated sources", () => {
      const cosmeticSources = { head_flower_hat: [{ type: "store" }] };
      const result = validateExclusionReferences(undefined, undefined, undefined, cosmeticSources);
      expect(result).toHaveLength(1);
      expect(result[0].excludedId).toBe("head_flower_hat");
    });

    it("does not flag non-excluded IDs", () => {
      const almanac = [{ items: { head_mimic_hat: {} } }];
      const result = validateExclusionReferences(almanac, undefined, undefined, undefined);
      expect(result).toHaveLength(0);
    });
  });
});
