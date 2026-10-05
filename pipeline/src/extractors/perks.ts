import type { PerkId, SkillId } from "#lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle.js";

export function extractPerks(fiddle: ParsedGameData): {
  perks: Record<PerkId, { name: string; skillId: SkillId; tier: number }>;
  perkTierLevels: number[];
} {
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const skillMenus = ui?.skill_menu as Record<string, Record<string, unknown>> | undefined;
  if (!skillMenus) {
    return {
      perks: {},
      perkTierLevels: [],
    };
  }

  const defaults = skillMenus.defaults as Record<string, unknown> | undefined;
  const category = defaults?.category as Record<string, unknown> | undefined;
  const perkTierLevels = Array.isArray(category?.level_requirements)
    ? (category.level_requirements as number[])
    : [];

  const perksData = fiddle.perks as Record<string, Record<string, unknown>> | undefined;
  const perks = {} as Record<PerkId, { name: string; skillId: SkillId; tier: number }>;

  for (const skillId of Object.keys(skillMenus).sort()) {
    if (skillId === "defaults") continue;
    const skillMenu = skillMenus[skillId];
    if (typeof skillMenu !== "object" || skillMenu === null) continue;

    for (let tierIdx = 1; tierIdx <= 5; tierIdx++) {
      const tierKey = `tier_${tierIdx}`;
      const tierEntries = Array.isArray(skillMenu[tierKey])
        ? (skillMenu[tierKey] as unknown[])
        : [];

      for (const entry of tierEntries) {
        if (typeof entry !== "object" || entry === null) continue;
        const perkId = (entry as Record<string, unknown>).perk as string | undefined;
        if (!perkId) continue;

        const perkData = perksData?.[perkId];
        const name = perkData?.name as string | undefined;
        if (!name) {
          throw new Error(
            `Perk "${perkId}" found in skill menu but has no name in perks.toml — check data assembly`,
          );
        }

        perks[perkId as PerkId] = {
          name,
          skillId: skillId as SkillId,
          tier: tierIdx,
        };
      }
    }
  }

  console.log(`  Perks: ${Object.keys(perks).length} perks, ${perkTierLevels.length} tier levels`);
  return { perks, perkTierLevels };
}
