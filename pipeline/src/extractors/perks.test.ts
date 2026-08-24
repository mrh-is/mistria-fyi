import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase } from "../test-helpers.js";
import { extractPerks } from "./perks.js";

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({ perks: {}, ui: { skill_menu: { defaults: {} } }, ...overrides });
}

describe("extractPerks", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts perks from skill menu files with tier info", () => {
    const fiddle = makeFiddle({
      perks: {
        dungeon_delicacies: { name: "Dungeon Delicacies" },
        ornamental: { name: "Ornamental" },
      },
      ui: {
        skill_menu: {
          cooking: {
            tier_1: [{ perk: "dungeon_delicacies" }],
            tier_2: [],
            tier_3: [],
            tier_4: [],
            tier_5: [],
          },
          defaults: {
            category: { level_requirements: [1, 15, 30, 45, 60] },
          },
          farming: {
            tier_1: [],
            tier_2: [],
            tier_3: [],
            tier_4: [{ perk: "ornamental" }],
            tier_5: [],
          },
        },
      },
    });

    const { perks, perkTierLevels } = extractPerks(fiddle);

    expect(perks).toEqual({
      dungeon_delicacies: { name: "Dungeon Delicacies", skillId: "cooking", tier: 1 },
      ornamental: { name: "Ornamental", skillId: "farming", tier: 4 },
    });
    expect(perkTierLevels).toEqual([1, 15, 30, 45, 60]);
  });

  it("skips defaults.toml when iterating skill menus", () => {
    const fiddle = makeFiddle({
      perks: {
        horsepower: { name: "Horsepower" },
      },
      ui: {
        skill_menu: {
          defaults: {
            category: { level_requirements: [1, 15, 30, 45, 60] },
            tier_1: [{ perk: "should_not_appear" }],
          },
          mount: {
            tier_1: [{ perk: "horsepower" }],
            tier_2: [],
            tier_3: [],
            tier_4: [],
            tier_5: [],
          },
        },
      },
    });

    const { perks } = extractPerks(fiddle);
    expect(perks).not.toHaveProperty("should_not_appear");
    expect(perks).toHaveProperty("horsepower");
  });

  it("throws when perk has no name in perks.toml", () => {
    const fiddle = makeFiddle({
      perks: {},
      ui: {
        skill_menu: {
          combat: {
            tier_1: [{ perk: "unknown_perk" }],
            tier_2: [],
            tier_3: [],
            tier_4: [],
            tier_5: [],
          },
          defaults: {
            category: { level_requirements: [1, 15, 30, 45, 60] },
          },
        },
      },
    });

    expect(() => extractPerks(fiddle)).toThrow(
      'Perk "unknown_perk" found in skill menu but has no name in perks.toml',
    );
  });

  it("returns empty result when no ui.skill_menu data", () => {
    const fiddle = makeFiddle({ ui: {} });

    const { perks, perkTierLevels } = extractPerks(fiddle);
    expect(Object.keys(perks)).toEqual([]);
    expect(perkTierLevels).toEqual([]);
  });
});
