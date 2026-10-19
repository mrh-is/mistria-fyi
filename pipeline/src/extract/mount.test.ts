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
    quests: { story_quests: { find_the_weathervane: {} } },
    ranching: { animals: { horse: { core: { name: "Horse" }, variants } } },
    requirements: { repaired_horse_statue: { seen_cutscene: "find_the_weathervane_setup" } },
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
});
