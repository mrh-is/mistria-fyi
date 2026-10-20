import { LOCALE_CODES } from "#lib/types/locale.js";

import { projectRequirementExpressionToAvailability } from "../acquisition/requirement-projector.js";
import { expectNonEmptyString } from "../data-shapes.js";
import { HORSE_STATUE_ESSENCE_COST, MOUNT_APPEARANCE_UNLOCKS } from "../overrides/game-facts.js";
import { sourceFileFor } from "../parse/parse-fiddle.js";
import { parseRequirements } from "../parse/requirements.js";

import type { Source } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type { Mount, MountAppearanceId, QuestId } from "#lib/types/tracker-data.js";

import type { Localizer } from "../localize/localize.js";
import type { MountAppearanceUnlock } from "../overrides/game-facts.js";
import type { ParsedGameData } from "../parse/parse-fiddle.js";
import type { RequirementContext } from "../parse/requirements.js";

export interface MountExtraction {
  localeNames: Record<LocaleCode, Record<MountAppearanceId, string>>;
  mount: Mount;
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
  const unlockSources: Record<MountAppearanceUnlock, Source> = {
    big_egg: { type: "chicken_statue", unlockCondition: "breed_all_chicken_tiers" },
    horse_statue: {
      type: "horse_statue",
      cost: HORSE_STATUE_ESSENCE_COST,
      questId: horseStatueQuest(requirementContext),
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

  console.log(`  Mount: ${Object.keys(appearances).length} appearances`);
  return { localeNames, mount: { appearances } };
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
