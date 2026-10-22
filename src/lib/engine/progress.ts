import { trackerData } from "#lib/data/index.js";

import type { AvailabilityWindow } from "#lib/types/availability.js";
import type { Season, VillagerId, Weather } from "#lib/types/tracker-data.js";
import type { ProgressState } from "#lib/types/user-progress.js";
import type { DeepReadonly } from "#lib/utils/deep-readonly.js";

export const MAX_HEART_LEVEL = 10;
export const MAX_SKILL_LEVEL = 60;

// ─── Types ──────────────────────────────────────────────────────────

export interface CategoryProgress {
  completed: number;
  remainingInScope: number;
  total: number;
}

/** Why `normalizeLevel` changed or rejected its input; absent when the value was already valid. */
export type LevelIssue = "above-max" | "negative" | "not-a-number";

// ─── Helpers ────────────────────────────────────────────────────────

export interface NormalizedLevel {
  issue?: LevelIssue;
  value: number;
}

export interface ProgressContext {
  availabilityWindows: readonly AvailabilityWindow[];
  progress: DeepReadonly<ProgressState>;
  worldState: { season: Season; weather: Weather };
}

/**
 * Clamp a level into `[0, max]` after flooring. Nonfinite input collapses to 0. Every state
 * ingress that installs a level (setters, additive merge, native save extraction) routes through
 * this so the canonical state never holds a value the normal controls could not produce.
 */
export function clampLevel(level: number, max: number): number {
  return normalizeLevel(level, max).value;
}

export function clampMineFloor(floor: number): number {
  return clampLevel(floor, getMaxMineFloor());
}

export function clampRenownLevel(level: number): number {
  return clampLevel(level, getMaxRenownLevel());
}

export function getMaxMineFloor(): number {
  const lastBiome = trackerData.mines.biomes.at(-1);
  if (!lastBiome) throw new Error("Tracker data has no mine biomes");
  return lastBiome.floors.end;
}

export function getMaxRenownLevel(): number {
  const lastRank = trackerData.townRanks.at(-1);
  if (!lastRank) throw new Error("Tracker data has no town ranks");
  return lastRank.levels.end;
}

export function isVillagerComplete(
  villagerId: VillagerId,
  completed: DeepReadonly<ProgressState>,
): boolean {
  const level = completed.heartLevels[villagerId] ?? 0;
  return level >= MAX_HEART_LEVEL && isRelationshipSettled(villagerId, completed);
}

/**
 * Normalize an untrusted level into its finite domain `[0, max]`:
 *
 * - wrong type or nonfinite → `0`, issue `"not-a-number"`
 * - fractional → floored silently (the game stores whole levels; a fraction is harmless drift)
 * - negative (after flooring) → `0`, issue `"negative"`
 * - above `max` → `max`, issue `"above-max"`
 *
 * Callers decide whether an issue is a warning (native save import, which accepts usable facts)
 * or a rejection (backup restore, which requires the whole document to be valid).
 */
export function normalizeLevel(level: unknown, max: number): NormalizedLevel {
  if (typeof level !== "number" || !Number.isFinite(level)) {
    return { issue: "not-a-number", value: 0 };
  }
  const floored = Math.floor(level);
  if (floored < 0) return { issue: "negative", value: 0 };
  if (floored > max) return { issue: "above-max", value: max };
  return { value: floored };
}

/**
 * A non-dateable Villager has nothing to settle; a dateable one settles as platonic, or as married
 * once the household declares its child choice.
 */
export function isRelationshipSettled(
  villagerId: VillagerId,
  completed: DeepReadonly<ProgressState>,
): boolean {
  if (!trackerData.villagers[villagerId].dateable) return true;
  const relationship = completed.villagerRelationships[villagerId] ?? "undecided";
  if (relationship === "platonic") return true;
  if (relationship === "married") return completed.childChoice !== "undeclared";
  return false;
}
