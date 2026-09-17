import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle as makeFiddleBase, requireGameAssetsDir } from "../test-helpers.js";
import { extractSkills } from "./skills.js";

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({ perks: {}, skills: {}, ui: {}, ...overrides });
}

describe("extractSkills", () => {
  let assetsDir: string;

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    assetsDir = requireGameAssetsDir();
  });

  it("returns empty defaults when skills data is absent", () => {
    const fiddle = makeFiddleBase({});
    const result = extractSkills(fiddle, assetsDir);
    expect(result.skills).toEqual({});
    expect(result.perkTierLevels).toEqual([0, 0, 0, 0, 0]);
  });

  it("moves skill names from structural data into locale chunks", () => {
    const fiddle = makeFiddle({
      skills: {
        farming: { name: "Farming" },
        mining: { name: "Mining" },
      },
    });

    const result = extractSkills(fiddle, assetsDir);
    expect(result.skills).toEqual({
      farming: { perkTiers: [{}, {}, {}, {}, {}] },
      mining: { perkTiers: [{}, {}, {}, {}, {}] },
    });
    expect(result.localeNames.en).toMatchObject({ farming: "Farming", mining: "Mining" });
    expect(result.localeNames.ja).toMatchObject({ farming: "農業", mining: "採掘" });
  });

  it("skips the default skill entry", () => {
    const fiddle = makeFiddle({
      skills: {
        combat: { name: "Combat" },
        default: { name: "Default" },
      },
    });

    const result = extractSkills(fiddle, assetsDir);
    expect(Object.keys(result.skills)).not.toContain("default");
    expect(Object.keys(result.skills)).toContain("combat");
  });

  it("converts snake_case IDs to title case as name fallback", () => {
    const fiddle = makeFiddle({
      skills: {
        bug_catching: {},
      },
    });

    const result = extractSkills(fiddle, assetsDir);
    expect(result.localeNames.en).toMatchObject({ bug_catching: "Bug Catching" });
  });

  it("extracts perkTierLevels from UI config", () => {
    const fiddle = makeFiddle({
      skills: {
        farming: { name: "Farming" },
      },
      ui: {
        skill_menu: {
          defaults: {
            category: {
              level_requirements: [0, 5, 15, 30, 50],
            },
          },
        },
      },
    });

    const result = extractSkills(fiddle, assetsDir);
    expect(result.perkTierLevels).toEqual([0, 5, 15, 30, 50]);
  });

  it("defaults perkTierLevels to zeros when UI config is absent", () => {
    const fiddle = makeFiddle({
      skills: { farming: { name: "Farming" } },
    });

    const result = extractSkills(fiddle, assetsDir);
    expect(result.perkTierLevels).toEqual([0, 0, 0, 0, 0]);
  });

  it("nests perks into tier arrays under each skill", () => {
    const fiddle = makeFiddle({
      perks: {
        green_thumb: { name: "Green Thumb" },
        harvest_moon: { name: "Harvest Moon" },
      },
      skills: {
        farming: { name: "Farming" },
      },
      ui: {
        skill_menu: {
          defaults: {
            category: { level_requirements: [0, 5, 15, 30, 50] },
          },
          farming: {
            tier_1: [{ perk: "green_thumb" }],
            tier_2: [{ perk: "harvest_moon" }],
          },
        },
      },
    });

    const result = extractSkills(fiddle, assetsDir);
    expect(result.skills).toEqual({
      farming: {
        perkTiers: [
          { green_thumb: { name: "Green Thumb" } },
          { harvest_moon: { name: "Harvest Moon" } },
          {},
          {},
          {},
        ],
      },
    });
  });

  it("throws when a perk referenced in skill menu has no name", () => {
    const fiddle = makeFiddle({
      perks: {
        nameless_perk: {},
      },
      skills: {
        farming: { name: "Farming" },
      },
      ui: {
        skill_menu: {
          farming: {
            tier_1: [{ perk: "nameless_perk" }],
          },
        },
      },
    });

    expect(() => extractSkills(fiddle, assetsDir)).toThrow(
      'Perk "nameless_perk" found in skill menu but has no name in perks data',
    );
  });

  it("handles multiple perks in the same tier", () => {
    const fiddle = makeFiddle({
      perks: {
        perk_a: { name: "Perk A" },
        perk_b: { name: "Perk B" },
      },
      skills: {
        mining: { name: "Mining" },
      },
      ui: {
        skill_menu: {
          mining: {
            tier_3: [{ perk: "perk_a" }, { perk: "perk_b" }],
          },
        },
      },
    });

    const result = extractSkills(fiddle, assetsDir);
    expect(result.skills).toEqual({
      mining: {
        perkTiers: [{}, {}, { perk_a: { name: "Perk A" }, perk_b: { name: "Perk B" } }, {}, {}],
      },
    });
  });

  it("returns empty perkTiers when skill has no menu entry", () => {
    const fiddle = makeFiddle({
      skills: {
        fishing: { name: "Fishing" },
      },
    });

    const result = extractSkills(fiddle, assetsDir);
    expect(result.skills).toEqual({
      fishing: {
        perkTiers: [{}, {}, {}, {}, {}],
      },
    });
  });

  it("skips non-object tier entries", () => {
    const fiddle = makeFiddle({
      perks: {
        real_perk: { name: "Real Perk" },
      },
      skills: {
        farming: { name: "Farming" },
      },
      ui: {
        skill_menu: {
          farming: {
            tier_1: ["not_an_object", null, { perk: "real_perk" }],
          },
        },
      },
    });

    const result = extractSkills(fiddle, assetsDir);
    expect(result.skills).toEqual({
      farming: {
        perkTiers: [{ real_perk: { name: "Real Perk" } }, {}, {}, {}, {}],
      },
    });
  });
});
