import { describe, expect, it } from "vitest";

import { parseFiddle } from "../parse-fiddle.js";
import { requireGameAssetsDir } from "../test-helpers.js";
import { extractSkills } from "./skills.js";

import type { SkillId } from "#lib/types/tracker-data.js";

const farming = "farming" as SkillId;

describe("extractSkills — real assets", () => {
  it("uses ui/skill_menu/<id>/name translations for skill display names", () => {
    const assetsDir = requireGameAssetsDir();
    const { localeNames, skills } = extractSkills(parseFiddle(assetsDir).data, assetsDir);

    expect(skills[farming]).toStrictEqual(
      expect.objectContaining({ perkTiers: expect.any(Array) }),
    );
    expect("name" in skills[farming]).toBe(false);
    expect(localeNames.en[farming]).toBe("Farming");
    expect(localeNames.ja[farming]).toBe("農業");
  });
});
