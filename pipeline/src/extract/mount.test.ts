import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRequirementContext } from "../parse/requirements.js";
import { makeFiddle, stubLocalizer } from "../test-helpers.js";
import { buildCutsceneQuestMap } from "./cutscene-quest-map.js";
import { extractMount } from "./mount.js";

const MOUNT_VARIANTS = {
  brown: { name: "Brown", tier: 1 },
  giant_chicken_gold: { acquirable: false, name: "Big Chicken Gold" },
  giant_chicken_white: { acquirable: false, name: "Big Chicken" },
  mistmare: { acquirable: false, name: "Mistmare" },
};

const MOUNT_MENU = {
  name: "Mistmare",
  tier_1: [
    { essence: 200, icon: "spr_horsepower", perk: "horsepower" },
    { essence: 190, icon: "spr_harvest_horse", perk: "harvest_horse" },
  ],
};

function mountMenu(fiddle: ReturnType<typeof makeMountFiddle>): Record<string, unknown> {
  const ui = fiddle.ui as { skill_menu: { mount: Record<string, unknown> } };
  return ui.skill_menu.mount;
}

function makeMountFiddle(variants: Record<string, Record<string, unknown>> = MOUNT_VARIANTS) {
  return makeFiddle({
    cutscenes: {
      find_the_weathervane: {
        quest_to_start: "find_the_weathervane",
        requirements: { seen_cutscene: "find_the_weathervane_setup" },
      },
      find_the_weathervane_setup: {},
    },
    misc_local: {
      giant_chicken_gold: "Big Gold Chicken",
      giant_chicken_white: "Big White Chicken",
      mistmare: "Mistmare",
    },
    perks: {
      harvest_horse: { name: "Harvest Horse" },
      horsepower: { name: "Horsepower" },
      mining_1: { name: "Mining I" },
    },
    quests: { story_quests: { find_the_weathervane: {} } },
    ranching: { animals: { horse: { core: { name: "Horse" }, variants } } },
    requirements: { repaired_horse_statue: { seen_cutscene: "find_the_weathervane_setup" } },
    ui: { skill_menu: { mount: structuredClone(MOUNT_MENU) } },
  });
}

function extract(fiddle: ReturnType<typeof makeMountFiddle>) {
  const context = createRequirementContext(
    fiddle.requirements as Record<string, unknown>,
    buildCutsceneQuestMap(fiddle),
  );
  return extractMount(fiddle, stubLocalizer(), context);
}

describe("extractMount", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
  });

  it("emits each unacquirable horse variant as a mount appearance", () => {
    const { localeNames, mount } = extract(makeMountFiddle());
    expect(mount.appearances).toEqual({
      giant_chicken_gold: {
        sources: [{ type: "chicken_statue", unlockCondition: "breed_all_chicken_tiers" }],
      },
      giant_chicken_white: {
        sources: [{ type: "chicken_statue", unlockCondition: "breed_all_chicken_tiers" }],
      },
      mistmare: {
        sources: [{ type: "horse_statue", cost: 100, questId: "find_the_weathervane" }],
      },
    });
    expect(localeNames.en).toEqual({
      giant_chicken_gold: "Big Gold Chicken",
      giant_chicken_white: "Big White Chicken",
      mistmare: "Mistmare",
    });
  });

  it("throws on an unreviewed unacquirable horse variant", () => {
    const fiddle = makeMountFiddle({
      ...MOUNT_VARIANTS,
      giant_duck: { acquirable: false, name: "Big Duck" },
    });
    expect(() => extract(fiddle)).toThrow('Unreviewed mount appearance "giant_duck"');
  });

  it("throws when the Horse Statue's requirement doesn't lead to a quest", () => {
    const fiddle = makeMountFiddle();
    fiddle.requirements = { repaired_horse_statue: { seen_cutscene: "unmapped_scene" } };
    expect(() => extract(fiddle)).toThrow('Expected "repaired_horse_statue" to resolve');
  });

  it("throws when misc_local has no name for an appearance", () => {
    const fiddle = makeMountFiddle();
    delete (fiddle.misc_local as Record<string, unknown>).mistmare;
    expect(() => extract(fiddle)).toThrow(
      "Expected nonempty string for mount.appearances.mistmare",
    );
  });

  it("emits each Mistmare perk with its Horse Statue essence cost", () => {
    const { mount, perkLocaleNames } = extract(makeMountFiddle());
    expect(mount.perks).toEqual({
      harvest_horse: {
        sources: [{ type: "horse_statue", cost: 190, questId: "find_the_weathervane" }],
      },
      horsepower: {
        sources: [{ type: "horse_statue", cost: 200, questId: "find_the_weathervane" }],
      },
    });
    expect(perkLocaleNames.en).toEqual({
      harvest_horse: "Harvest Horse",
      horsepower: "Horsepower",
    });
  });

  it("localizes perk names from the perks table", () => {
    const localizer = stubLocalizer();
    const fiddle = makeMountFiddle();
    const context = createRequirementContext(
      fiddle.requirements as Record<string, unknown>,
      buildCutsceneQuestMap(fiddle),
    );
    extractMount(fiddle, localizer, context);
    expect(localizer.localizeField).toHaveBeenCalledWith(
      expect.objectContaining({ category: "perks", field: "name", id: "horsepower" }),
    );
  });

  it("throws when the mount skill menu is missing", () => {
    const fiddle = makeMountFiddle();
    fiddle.ui = { skill_menu: {} };
    expect(() => extract(fiddle)).toThrow("ui/skill_menu/mount.toml");
  });

  it("throws when the mount skill menu has a tier beyond the first", () => {
    const fiddle = makeMountFiddle();
    mountMenu(fiddle).tier_2 = [{ essence: 300, perk: "horsepower" }];
    expect(() => extract(fiddle)).toThrow('Unreviewed mount perk tier "tier_2"');
  });

  it("throws when a mount perk has no essence cost", () => {
    const fiddle = makeMountFiddle();
    mountMenu(fiddle).tier_1 = [{ perk: "horsepower" }];
    expect(() => extract(fiddle)).toThrow("mount.perks.horsepower");
  });

  it("throws when a mount perk has no name in the perks table", () => {
    const fiddle = makeMountFiddle();
    mountMenu(fiddle).tier_1 = [{ essence: 205, perk: "nice_ride" }];
    expect(() => extract(fiddle)).toThrow("mount.perks.nice_ride");
  });
});
