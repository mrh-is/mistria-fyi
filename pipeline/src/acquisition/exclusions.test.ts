import { describe, expect, it } from "vitest";

import { makeFiddle } from "../test-helpers.js";
import { cosmeticExclusions, getExcludedCosmeticIds } from "./exclusions.js";

import type { CosmeticId } from "#lib/types/tracker-data.js";

describe("cosmetic exclusions", () => {
  it("derives baby presentation assets and Seridia equipment from native data", () => {
    const fiddle = makeFiddle({
      misc: { seridia_armor: ["new_seridia_outfit"] },
      player_assets: {
        baby_back_new_child_darker: { lut: "baby", name: "" },
        baby_back_new_child_lighter: { lut: "baby", name: "" },
        baby_backpack: { name: "Backpack" },
        new_seridia_outfit: { name: "Armor" },
      },
    });
    const ids = getExcludedCosmeticIds(fiddle);
    expect(ids.has("baby_back_new_child_darker" as CosmeticId)).toBe(true);
    expect(ids.has("baby_back_new_child_lighter" as CosmeticId)).toBe(true);
    expect(ids.has("new_seridia_outfit" as CosmeticId)).toBe(true);
    expect(ids.has("baby_backpack" as CosmeticId)).toBe(false);
    for (const entry of cosmeticExclusions(fiddle)) {
      expect(entry).toMatchObject({ value: true });
      expect(entry.evidence).toBeTruthy();
      expect(entry.reason).toBeTruthy();
    }
  });

  it("retains the two reviewed unresolved exclusions", () => {
    const ids = getExcludedCosmeticIds(makeFiddle());
    expect([...ids]).toEqual(["back_gear_march_mistrian_shield", "head_flower_hat"]);
  });

  it("rejects malformed native costume configuration", () => {
    expect(() => getExcludedCosmeticIds(makeFiddle({ misc: { seridia_armor: [42] } }))).toThrow(
      "Invalid native",
    );
  });
});
