import { beforeEach, describe, expect, it, vi } from "vitest";

import { createLocalizer } from "../localize.js";
import { makeFiddle as makeFiddleBase, stubLocalizer } from "../test-helpers.js";
import { extractSkills } from "./skills.js";

function makeFiddle(overrides: Record<string, unknown> = {}) {
  return makeFiddleBase({ perks: {}, skills: {}, ui: {}, ...overrides });
}

describe("extractSkills", () => {
  const localizer = stubLocalizer((input, locale) =>
    locale === "ja" && input.id === "farming" ? "農業" : undefined,
  );

  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
  });

  it("returns empty defaults when skills data is absent", () => {
    const fiddle = makeFiddleBase({});
    const result = extractSkills(fiddle, localizer);
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

    const result = extractSkills(fiddle, localizer);
    expect(result.skills).toEqual({
      farming: { perkTiers: [{}, {}, {}, {}, {}] },
      mining: { perkTiers: [{}, {}, {}, {}, {}] },
    });
    expect(result.localeNames.en).toMatchObject({ farming: "Farming", mining: "Mining" });
    expect(result.localeNames.ja).toMatchObject({ farming: "農業", mining: "Mining" });
  });

  it("skips the default skill entry", () => {
    const fiddle = makeFiddle({
      skills: {
        combat: { name: "Combat" },
        default: { name: "Default" },
      },
    });

    const result = extractSkills(fiddle, localizer);
    expect(Object.keys(result.skills)).not.toContain("default");
    expect(Object.keys(result.skills)).toContain("combat");
  });

  it("rejects a skill without a source name", () => {
    const fiddle = makeFiddle({
      skills: {
        bug_catching: {},
      },
    });

    expect(() => extractSkills(fiddle, localizer)).toThrow(
      "Expected nonempty string for skills.bug_catching.name in skills.toml",
    );
  });

  it("uses the reviewed English name for a shipped skill whose data has no name", () => {
    const fiddle = makeFiddle({ skills: { archaeology: {} } });

    expect(extractSkills(fiddle, localizer).localeNames.en).toMatchObject({
      archaeology: "Archaeology",
    });
    expect(localizer.localizeField).toHaveBeenCalledWith(
      expect.objectContaining({ expectedEnglishValue: "Archaeology", id: "archaeology" }),
    );
  });

  it("rejects a reviewed skill name that drifts from the game's English source cache", () => {
    const fiddle = makeFiddle({ skills: { archaeology: {} } });
    const key = "ui/skill_menu/archaeology/name";
    const localizerWithDrift = createLocalizer(
      (_language, directory) =>
        new Map([[key, directory === "source_caches" ? "Archeology" : "考古学"]]),
    );

    expect(() => extractSkills(fiddle, localizerWithDrift)).toThrow(
      `English localization mismatch for ordinal key "${key}"`,
    );
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

    const result = extractSkills(fiddle, localizer);
    expect(result.perkTierLevels).toEqual([0, 5, 15, 30, 50]);
  });

  it("defaults perkTierLevels to zeros when UI config is absent", () => {
    const fiddle = makeFiddle({
      skills: { farming: { name: "Farming" } },
    });

    const result = extractSkills(fiddle, localizer);
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

    const result = extractSkills(fiddle, localizer);
    expect(result.skills).toEqual({
      farming: {
        perkTiers: [{ green_thumb: {} }, { harvest_moon: {} }, {}, {}, {}],
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

    expect(() => extractSkills(fiddle, localizer)).toThrow(
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

    const result = extractSkills(fiddle, localizer);
    expect(result.skills).toEqual({
      mining: {
        perkTiers: [{}, {}, { perk_a: {}, perk_b: {} }, {}, {}],
      },
    });
  });

  it("returns empty perkTiers when skill has no menu entry", () => {
    const fiddle = makeFiddle({
      skills: {
        fishing: { name: "Fishing" },
      },
    });

    const result = extractSkills(fiddle, localizer);
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

    const result = extractSkills(fiddle, localizer);
    expect(result.skills).toEqual({
      farming: {
        perkTiers: [{ real_perk: {} }, {}, {}, {}, {}],
      },
    });
  });
});
