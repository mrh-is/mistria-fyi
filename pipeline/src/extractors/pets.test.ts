import { describe, expect, it } from "vitest";

import { extractPetCosmetics, extractPetSkins } from "./pets.js";

import type { ParsedGameData } from "../parse-fiddle.js";

function makeFiddle(overrides: Partial<Record<string, unknown>> = {}): ParsedGameData {
  return overrides as unknown as ParsedGameData;
}

describe("extractPetCosmetics", () => {
  it("extracts cosmetic sets with names and empty sources", () => {
    const fiddle = makeFiddle({
      pets: {
        cosmetic_sets: {
          flower_crown: { ui_icon: "spr_ui_item_pet_cosmetic_flower_crown" },
          halo: { name: "Halo", ui_icon: "spr_ui_item_pet_cosmetic_halo" },
        },
      },
    });

    const result = extractPetCosmetics(fiddle);
    expect(result).toEqual({
      flower_crown: { name: "Flower Crown", sources: [] },
      halo: { name: "Halo", sources: [] },
    });
  });

  it("returns empty record when no cosmetic_sets exist", () => {
    const fiddle = makeFiddle({ pets: {} });
    expect(extractPetCosmetics(fiddle)).toEqual({});
  });

  it("returns empty record when no pets key exists", () => {
    const fiddle = makeFiddle({});
    expect(extractPetCosmetics(fiddle)).toEqual({});
  });
});

describe("extractPetSkins", () => {
  it("extracts skins from items with pet_skin_unlock field", () => {
    const fiddle = makeFiddle({
      items: {
        other: {
          monster_drops: {
            pet_skin_mushroom: {
              name: "Pet Skin: Mushroom",
              pet_skin_unlock: "mushroom",
              soulbind: "forever",
            },
            pet_skin_sapling: {
              name: "Pet Skin: Sapling",
              pet_skin_unlock: "sapling",
              soulbind: "forever",
            },
            regular_item: {
              name: "Egg",
            },
          },
        },
      },
    });

    const result = extractPetSkins(fiddle);
    expect(result).toEqual({
      mushroom: { name: "Mushroom", sources: [] },
      sapling: { name: "Sapling", sources: [] },
    });
  });

  it("returns empty record when no pet skin items exist", () => {
    const fiddle = makeFiddle({ items: {} });
    expect(extractPetSkins(fiddle)).toEqual({});
  });
});
