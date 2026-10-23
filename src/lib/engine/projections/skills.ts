import { trackerData } from "#lib/data/index.js";
import { MAX_SKILL_LEVEL } from "#lib/engine/progress.js";
import { recordKeys } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type { CategoryProjection } from "#lib/engine/projections/category-projection.js";
import type { PerkId, SkillId } from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

export interface SkillRow {
  id: SkillId;
  /** Skill level, capped at `MAX_SKILL_LEVEL`. */
  level: number;
  /** Bought perks across the skill's tiers. */
  perks: number;
  /** Every perk across the skill's tiers. */
  perkTotal: number;
}

export interface SkillsProjection extends CategoryProjection {
  rows: SkillRow[];
}

/**
 * A skill is complete at `MAX_SKILL_LEVEL` with every perk bought. A bought perk counts even when
 * the player has switched it off; the game keeps it in `player.perks` either way.
 */
export function isSkillComplete(id: SkillId, progress: DeepReadonly<ProgressState>): boolean {
  return (
    (progress.skillLevels[id] ?? 0) >= MAX_SKILL_LEVEL &&
    perksOfSkill(id).every((perkId) => progress.unlockedPerks.has(perkId))
  );
}

/** The skill's perks across every tier, in game order. */
export function perksOfSkill(id: SkillId): PerkId[] {
  return trackerData.skills[id].perkTiers.flatMap((tier) => recordKeys(tier));
}

/** Each level and each perk of each skill is one step. */
export function projectSkills(ctx: ProgressContext): SkillsProjection {
  const rows = recordKeys(trackerData.skills).map((id): SkillRow => {
    const perkIds = perksOfSkill(id);
    return {
      id,
      level: Math.min(ctx.progress.skillLevels[id] ?? 0, MAX_SKILL_LEVEL),
      perks: perkIds.filter((perkId) => ctx.progress.unlockedPerks.has(perkId)).length,
      perkTotal: perkIds.length,
    };
  });
  const total = rows.reduce((sum, row) => sum + MAX_SKILL_LEVEL + row.perkTotal, 0);
  const completed = rows.reduce((sum, row) => sum + row.level + row.perks, 0);
  return { rows, totals: { completed, remainingInScope: total - completed, total } };
}
