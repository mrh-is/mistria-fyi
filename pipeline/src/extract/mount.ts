import { LOCALE_CODES } from "#lib/types/locale.js";

import { projectRequirementExpressionToAvailability } from "../acquisition/requirement-projector.js";
import { expectArray, expectNonEmptyString, expectNumber, expectRecord } from "../data-shapes.js";
import { HORSE_STATUE_ESSENCE_COST, MOUNT_APPEARANCE_UNLOCKS } from "../overrides/game-facts.js";
import { sourceFileFor } from "../parse/parse-fiddle.js";
import { parseRequirements } from "../parse/requirements.js";

import type { Source } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type { Mount, MountAppearanceId, PerkId, QuestId } from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize/localize.js";
import type { MountAppearanceUnlock } from "../overrides/game-facts.js";
import type { ParsedGameData } from "../parse/parse-fiddle.js";
import type { RequirementContext } from "../parse/requirements.js";

export interface MountExtraction {
  localeNames: Record<LocaleCode, Record<MountAppearanceId, string>>;
  mount: Mount;
  /** Mistmare perk names, merged into the perks locale chunk beside the skill perks. */
  perkLocaleNames: Record<LocaleCode, Record<PerkId, string>>;
}

/** The named requirement `obj_horse_statue.gml` checks before the statue appears. */
const HORSE_STATUE_REQUIREMENT = "repaired_horse_statue";

/**
 * The Mistmare's appearances are the horse variants the game marks `acquirable = false`: the
 * player never breeds them, and the mount menu lists them by ID (`AnimalMenu.gml`). Names come from
 * `misc_local/<id>`, as `create_default_mount` resolves them. Throws on an unreviewed appearance,
 * since its unlock lives in GML the pipeline can't read.
 */
export function extractMount(
  fiddle: ParsedGameData,
  localizer: Localizer,
  requirementContext: RequirementContext,
): MountExtraction {
  const localeNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<MountAppearanceId, string>
  >;
  const ranching = fiddle.ranching as Record<string, unknown> | undefined;
  const animals = ranching?.animals as Record<string, Record<string, unknown>> | undefined;
  const variants = animals?.horse?.variants as Record<string, Record<string, unknown>> | undefined;
  if (!variants) {
    throw new Error("ranching/animals/horse.toml has no variants; the mount needs them");
  }

  const miscLocal = fiddle.misc_local as Record<string, unknown> | undefined;
  const sourcePath = sourceFileFor(fiddle, "ranching.animals.horse");
  const horseStatueQuestId = horseStatueQuest(requirementContext);
  const unlockSources: Record<MountAppearanceUnlock, Source> = {
    big_egg: { type: "chicken_statue", unlockCondition: "breed_all_chicken_tiers" },
    horse_statue: {
      type: "horse_statue",
      cost: HORSE_STATUE_ESSENCE_COST,
      questId: horseStatueQuestId,
    },
  };

  const appearances: Mount["appearances"] = {};
  for (const [id, variant] of Object.entries(variants)) {
    if (id === "default" || variant.acquirable !== false) continue;
    const unlock = Object.hasOwn(MOUNT_APPEARANCE_UNLOCKS, id)
      ? MOUNT_APPEARANCE_UNLOCKS[id]
      : undefined;
    if (!unlock) {
      throw new Error(
        `Unreviewed mount appearance "${id}" in ${sourcePath}; add its unlock to MOUNT_APPEARANCE_UNLOCK_ENTRIES`,
      );
    }
    const appearanceId = id as MountAppearanceId;
    appearances[appearanceId] = { sources: [unlockSources[unlock]] };

    const englishValue = expectNonEmptyString(miscLocal?.[id], {
      entityId: `mount.appearances.${id}`,
      fieldPath: id,
      sourcePath: sourceFileFor(fiddle, "misc_local"),
    });
    const { values } = localizer.localizeField({
      category: "misc_local",
      classification: "localizable",
      englishValue,
      id,
    });
    for (const locale of LOCALE_CODES) localeNames[locale][appearanceId] = values[locale];
  }

  const { perkLocaleNames, perks } = extractMountPerks(fiddle, localizer, horseStatueQuestId);

  console.log(
    `  Mount: ${Object.keys(appearances).length} appearances, ${Object.keys(perks).length} perks`,
  );
  return { localeNames, mount: { appearances, perks }, perkLocaleNames };
}

/** The mount menu's only tier: the Horse Statue sells every Mistmare perk from the start. */
const MOUNT_PERK_TIER = "tier_1";

/**
 * The Mistmare's perks are the Horse Statue's menu, `ui/skill_menu/mount.toml`: one tier of perks,
 * each bought with essence. Names come from `perks/<id>/name`, like every skill perk. Throws on a
 * tier beyond the first, which the tracker would need a review to model.
 */
function extractMountPerks(
  fiddle: ParsedGameData,
  localizer: Localizer,
  questId: QuestId,
): Pick<MountExtraction, "perkLocaleNames"> & { perks: Mount["perks"] } {
  const perkLocaleNames = Object.fromEntries(LOCALE_CODES.map((locale) => [locale, {}])) as Record<
    LocaleCode,
    Record<PerkId, string>
  >;
  const ui = fiddle.ui as Record<string, unknown> | undefined;
  const skillMenus = ui?.skill_menu as Record<string, unknown> | undefined;
  if (!skillMenus?.mount) {
    throw new Error("ui/skill_menu/mount.toml is missing; the Mistmare's perks need it");
  }
  const sourcePath = sourceFileFor(fiddle, "ui.skill_menu.mount");
  const menu = expectRecord(skillMenus.mount, { fieldPath: "mount", sourcePath });
  for (const key of Object.keys(menu)) {
    if (key.startsWith("tier_") && key !== MOUNT_PERK_TIER) {
      throw new Error(`Unreviewed mount perk tier "${key}" in ${sourcePath}`);
    }
  }

  const perksData = fiddle.perks as Record<string, Record<string, unknown> | undefined> | undefined;
  const perks: Mount["perks"] = {};
  const entries = expectArray<unknown>(menu[MOUNT_PERK_TIER], {
    fieldPath: MOUNT_PERK_TIER,
    sourcePath,
  });
  for (const [index, entry] of entries.entries()) {
    const fieldPath = `${MOUNT_PERK_TIER}[${index}]`;
    const record = expectRecord(entry, { fieldPath, sourcePath });
    const perkId = expectNonEmptyString(record.perk, {
      fieldPath: `${fieldPath}.perk`,
      sourcePath,
    }) as PerkId;
    const cost = expectNumber(record.essence, {
      entityId: `mount.perks.${perkId}`,
      fieldPath: "essence",
      sourcePath,
    });
    perks[perkId] = { sources: [{ type: "horse_statue", cost, questId }] };

    const englishValue = expectNonEmptyString(perksData?.[perkId]?.name, {
      entityId: `mount.perks.${perkId}`,
      fieldPath: "name",
      sourcePath: sourceFileFor(fiddle, "perks"),
    });
    const { values } = localizer.localizeField({
      category: "perks",
      classification: "localizable",
      englishValue,
      field: "name",
      id: perkId,
    });
    for (const locale of LOCALE_CODES) perkLocaleNames[locale][perkId] = values[locale];
  }
  return { perkLocaleNames, perks };
}

/**
 * The quest whose start repairs the Horse Statue. The statue's requirement is a cutscene, which
 * the cutscene-quest map resolves to the quest it leads into, so the source can name a quest.
 */
function horseStatueQuest(context: RequirementContext): QuestId {
  const location = {
    fieldPath: HORSE_STATUE_REQUIREMENT,
    sourcePath: "fiddle/requirements.toml",
  };
  const expression = parseRequirements(
    { [HORSE_STATUE_REQUIREMENT]: true },
    context.namedRequirements,
    context.primitivePredicates,
    location,
  );
  const availability = projectRequirementExpressionToAvailability(expression, context, location);
  if (availability.type !== "quest" || availability.state !== "available") {
    throw new Error(
      `Expected "${HORSE_STATUE_REQUIREMENT}" to resolve to a quest becoming available, got ${JSON.stringify(availability)}`,
    );
  }
  return availability.questId;
}
