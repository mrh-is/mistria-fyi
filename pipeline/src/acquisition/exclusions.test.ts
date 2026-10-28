import { describe, expect, it } from "vitest";

import { validateCosmeticExclusionSources } from "../overrides/exclusions.js";
import { makeFiddle } from "../test-helpers.js";
import { collectNaturalSources } from "./collectors/natural.js";
import { cosmeticExclusions, getExcludedCosmeticIds } from "./exclusions.js";
import { CosmeticSourceAccumulator, ItemSourceAccumulator } from "./source-accumulator.js";

import type { CosmeticId } from "#lib/types/tracker-data.js";

describe("cosmetic exclusions", () => {
  it("rejects an exclusion when the production collector finds its native perk reward", () => {
    const fiddle = makeFiddle({
      misc: {
        earthly_essence: { spring: [{ inner_data: "head_flower_hat", item_id: "cosmetic" }] },
      },
    });
    const cosmetics = new CosmeticSourceAccumulator();
    expect(() => {
      validateCosmeticExclusionSources(fiddle, cosmetics);
    }).not.toThrow();
    collectNaturalSources(fiddle, new ItemSourceAccumulator(), cosmetics);
    expect(cosmetics.get("head_flower_hat" as CosmeticId)).toEqual([
      {
        type: "perk_drop",
        activity: "crop_harvest",
        availability: { type: "season", seasons: ["spring"] },
        perkId: "earthly_essence",
      },
    ]);
    expect(() => {
      validateCosmeticExclusionSources(fiddle, cosmetics);
    }).toThrow(
      "Obsolete reviewed cosmetic exclusion entry now encoded in native acquisition sources: head_flower_hat",
    );
  });

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
