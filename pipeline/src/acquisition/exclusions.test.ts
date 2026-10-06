import { describe, expect, it } from "vitest";

import { COSMETIC_EXCLUSIONS, getExcludedCosmeticIds, isExcludedCosmetic } from "./exclusions.js";

import type { CosmeticId } from "#lib/types/tracker-data.js";

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

  describe("getExcludedCosmeticIds", () => {
    it("returns a set matching the exclusion table", () => {
      const ids = getExcludedCosmeticIds();
      expect(ids.size).toBe(COSMETIC_EXCLUSIONS.length);
      for (const exclusion of COSMETIC_EXCLUSIONS) {
        expect(ids.has(exclusion.id)).toBe(true);
      }
    });
  });
});
