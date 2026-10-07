import { LOCALE_CODES } from "#lib/types/locale.js";

import { expectNonEmptyString, expectNumberArray } from "../data-shapes.js";
import { SKILL_ENGLISH_NAMES } from "../overrides/ordinal-names.js";
import { sourceFileFor } from "../parse-fiddle.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { PerkId, PerkTier, Skill, SkillId, TrackerData } from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize.js";
import type { ParsedGameData } from "../parse-fiddle.js";

// v1.0.5 skills.toml has no name fields. These are the exact English source-cache values, checked
// against each locale's English baseline by expectedEnglishValue below.

/**
 * Skill display names are localized from `ui/skill_menu/<skill-id>/name`, e.g.
 * `ui/skill_menu/farming/name = "農業"` in the Japanese translation table.
 */
export function extractSkills(
  fiddle: ParsedGameData,
  localizer: Localizer,
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
  const rawLevels =
    category?.level_requirements === undefined
      ? []
      : expectNumberArray(category.level_requirements, {
          fieldPath: "skill_menu.defaults.category.level_requirements",
          sourcePath: sourceFileFor(fiddle, "ui.skill_menu.defaults"),
        });
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
    const reviewedName = skillsData[id].name === undefined ? SKILL_ENGLISH_NAMES[id] : undefined;
    const name = expectNonEmptyString(skillsData[id].name ?? reviewedName, {
      entityId: `skills.${id}`,
      fieldPath: "name",
      sourcePath: sourceFileFor(fiddle, `skills.${id}`),
    });
    const perkTiers = buildPerkTiers(id, skillMenus, perksData, localizer, perkLocaleNames);
    skills[id as SkillId] = { perkTiers };

    const { values } = localizer.localizeField({
      category: "ui/skill_menu",
      classification: "localizable",
      englishValue: name,
      expectedEnglishValue: name,
      field: "name",
      id,
      requireEnglishSource: reviewedName !== undefined,
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
  localizer: Localizer,
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
      const { values } = localizer.localizeField({
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
