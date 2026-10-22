import { trackerData } from "#lib/data/index.js";
import { MAX_SKILL_LEVEL } from "#lib/engine/progress.js";
import { recordKeys } from "#lib/utils/record.js";

import type { ProgressContext } from "#lib/engine/progress.js";
import type { CategoryProjection } from "#lib/engine/projections/category-projection.js";
import type { SkillId } from "#lib/types/tracker-data.js";

export interface SkillRow {
  id: SkillId;
  /** Skill level, capped at `MAX_SKILL_LEVEL`. */
  level: number;
}

export interface SkillsProjection extends CategoryProjection {
  rows: SkillRow[];
}

/** Each level of each skill is one step. */
export function projectSkills(ctx: ProgressContext): SkillsProjection {
  const rows = recordKeys(trackerData.skills).map((id): SkillRow => ({
    id,
    level: Math.min(ctx.progress.skillLevels[id] ?? 0, MAX_SKILL_LEVEL),
  }));
  const total = rows.length * MAX_SKILL_LEVEL;
  const completed = rows.reduce((sum, row) => sum + row.level, 0);
  return { rows, totals: { completed, remainingInScope: total - completed, total } };
}
