import { LOCALE_CODES } from "$lib/types/locale.js";

import { localizeField } from "../localize";

import type { LocaleCode } from "$lib/types/locale.js";
import type { PerkId, PerkTier, Skill, SkillId, TrackerData } from "$lib/types/tracker-data.js";

import type { ParsedGameData } from "../parse-fiddle";

/**
 * Skill display names are localized from `ui/skill_menu/<skill-id>/name`, e.g.
 * `ui/skill_menu/farming/name = "農業"` in the Japanese translation table.
 */
export function extractSkills(
  fiddle: ParsedGameData,
  assetsDir: string,
): {
  localeNames: Record<LocaleCode, Record<SkillId, string>>;
  perkLocaleNames: Record<LocaleCode, Record<PerkId, string>>;
  perkTierLevels: TrackerData["perkTierLevels"];
  skills: TrackerData["skills"];
} {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<SkillId, string>
  >;
  const perkLocaleNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<PerkId, string>
  >;
  const skillsData = fiddle.skills as Record<string, Record<string, unknown>> | undefined;
  if (!skillsData) {
    return { localeNames, perkLocaleNames, perkTierLevels: [0, 0, 0, 0, 0], skills: {} };
  }

  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const skillMenus = ui?.skill_menu as Record<string, Record<string, unknown>> | undefined;

  const defaults = skillMenus?.defaults;
  const category = defaults?.category as Record<string, unknown> | undefined;
  const rawLevels = Array.isArray(category?.level_requirements)
    ? (category.level_requirements as number[])
    : [];
  const perkTierLevels = [
    rawLevels[0] ?? 0,
    rawLevels[1] ?? 0,
    rawLevels[2] ?? 0,
    rawLevels[3] ?? 0,
    rawLevels[4] ?? 0,
  ] as TrackerData["perkTierLevels"];

  const perksData = fiddle.perks as Record<string, Record<string, unknown>> | undefined;

  const skills = {} as Record<SkillId, Skill>;
  for (const id of Object.keys(skillsData)) {
    if (id === "default") continue;
    const name = (skillsData[id].name as string | undefined) ?? snakeToTitle(id);
    const perkTiers = buildPerkTiers(id, skillMenus, perksData, assetsDir, perkLocaleNames);
    skills[id as SkillId] = { perkTiers };

    const { values } = localizeField(assetsDir, {
      category: "ui/skill_menu",
      classification: "localizable",
      englishValue: name,
      field: "name",
      id,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][id as SkillId] = values[locale];
  }

  const totalPerks = Object.values(skills).reduce(
    (n, s) => n + s.perkTiers.reduce((m, t) => m + Object.keys(t).length, 0),
    0,
  );
  console.log(`  Skills: ${Object.keys(skills).length}, ${totalPerks} perks`);
  return { localeNames, perkLocaleNames, perkTierLevels, skills };
}

function buildPerkTiers(
  skillId: string,
  skillMenus: Record<string, Record<string, unknown>> | undefined,
  perksData: Record<string, Record<string, unknown>> | undefined,
  assetsDir: string,
  perkLocaleNames: Record<LocaleCode, Record<PerkId, string>>,
): [PerkTier, PerkTier, PerkTier, PerkTier, PerkTier] {
  const tiers: [PerkTier, PerkTier, PerkTier, PerkTier, PerkTier] = [{}, {}, {}, {}, {}];
  const menu = skillMenus?.[skillId];
  if (!menu) return tiers;

  for (let tierIdx = 0; tierIdx < 5; tierIdx++) {
    const tierKey = `tier_${tierIdx + 1}`;
    const entries = Array.isArray(menu[tierKey]) ? (menu[tierKey] as unknown[]) : [];

    for (const entry of entries) {
      if (typeof entry !== "object" || entry === null) continue;
      const perkId = (entry as Record<string, unknown>).perk as string | undefined;
      if (!perkId) continue;

      const perkData = perksData?.[perkId];
      const name = perkData?.name as string | undefined;
      if (!name) {
        throw new Error(`Perk "${perkId}" found in skill menu but has no name in perks data`);
      }

      tiers[tierIdx][perkId as PerkId] = {};
      const { values } = localizeField(assetsDir, {
        category: "perks",
        classification: "localizable",
        englishValue: name,
        field: "name",
        id: perkId,
      });
      for (const locale of LOCALE_CODES) perkLocaleNames[locale][perkId as PerkId] = values[locale];
    }
  }

  return tiers;
}

function snakeToTitle(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
