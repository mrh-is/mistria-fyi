import { evaluateAvailabilityCondition, extractDisplayBadges } from "./availability-condition.js";
import { isConditionVisible } from "./visibility.js";

import type { WorldDay } from "#lib/engine/world-state.js";
import type { AvailabilityCondition, Source } from "#lib/types/acquisition.js";
import type { TrackerData } from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

import type { AvailabilityContext, DisplayBadges } from "./availability-condition.js";
import type { UserProgressionState } from "./visibility.js";

/** What decides whether a row is doable: today's season & weather, & the player's recorded progress. */
export interface DayContext {
  acquiredItems?: AvailabilityContext["acquiredItems"];
  festivals?: Partial<TrackerData["festivals"]>;
  mines?: {
    biomes: TrackerData["mines"]["biomes"];
    monsters: Partial<TrackerData["mines"]["monsters"]>;
  };
  /** Derived without "Show spoilers", which only changes what the spoiler UI reveals. */
  progressionState: UserProgressionState;
  replicatorUnlocked?: boolean;
  worldState: WorldDay;
}

/** A row whose availability is decided by its sources & its own spoiler gate. */
export interface AvailabilityRow {
  sources: readonly Source[];
  visibility?: VisibilityCondition;
}

/** Which sources a page's filters show; omitted, every source shows. */
export type ShowsSource = (source: Source) => boolean;

/**
 * Whether the player can act on a row today. A locked row never can. A row without sources always
 * can; any other row needs a doable source among those the filters show (#501), so a hidden shop
 * can't keep a spring insect doable in summer.
 */
export function isDoableToday(
  row: AvailabilityRow,
  ctx: DayContext,
  showsSource: ShowsSource = () => true,
): boolean {
  if (!isConditionVisible(row.visibility, ctx.progressionState)) return false;
  if (row.sources.length === 0) return true;
  return row.sources.some((source) => showsSource(source) && isSourceDoable(source, ctx));
}

/** Whether a row stays on the page under the filters. A row without sources always does. */
export function isRowShown(
  sources: readonly Source[],
  showsSource: ShowsSource = () => true,
): boolean {
  return sources.length === 0 || sources.some((source) => showsSource(source));
}

/**
 * Whether one source works today. It doesn't while it's locked, while a progress gate the app
 * records is unmet, or out of the current season or weather. Gates the app can't evaluate (game
 * predicates, date unlocks) count as met, & time of day never counts against it.
 */
export function isSourceDoable(source: Source, ctx: DayContext): boolean {
  if (!isConditionVisible(getSourceVisibility(source), ctx.progressionState)) return false;
  const mineFloor = sourceMineFloor(source, ctx.mines);
  if (mineFloor !== undefined && ctx.progressionState.mineFloor < mineFloor) return false;
  if (source.type === "festival" || source.type === "festival_activity") {
    const date = ctx.festivals?.[source.festivalId]?.date;
    if (
      date &&
      (date.season !== ctx.worldState.season ||
        (ctx.worldState.day !== undefined && date.day !== ctx.worldState.day))
    ) {
      return false;
    }
  }
  if (source.type === "artifact_replicator") {
    if (ctx.replicatorUnlocked === false) return false;
    const acquired = isAvailabilityDoable(
      { type: "itemAcquired", itemId: source.originalItemId },
      ctx,
      { acquiredItems: ctx.acquiredItems },
    );
    if (!acquired) return false;
  }
  return isAvailabilityDoable(getAvailabilityCondition(source), ctx);
}

function sourceMineFloor(source: Source, mines: DayContext["mines"]): number | undefined {
  if (!mines) return undefined;
  const { biomes, monsters } = mines;
  if (source.type === "monster") {
    const spawnBiomes = monsters[source.monsterId]?.biomes;
    if (spawnBiomes) return biomes.find(({ id }) => spawnBiomes.includes(id))?.floors.start;
    // These two Clods have drop records but no confirmed spawn biome (#622).
    if (
      source.monsterId === "any" ||
      source.monsterId === "mistrilclod" ||
      source.monsterId === "rockclod_purple"
    ) {
      return biomes.at(0)?.floors.start;
    }
    return undefined;
  }
  if (source.type === "mine" || source.type === "mine_fish") {
    return source.biomeId === undefined
      ? biomes.at(0)?.floors.start
      : biomes.find(({ id }) => id === source.biomeId)?.floors.start;
  }
  return undefined;
}

/** Evaluate row-level requirements with the same day policy as acquisition sources. */
export function isAvailabilityDoable(
  condition: AvailabilityCondition | undefined,
  ctx: DayContext,
  facts: Pick<AvailabilityContext, "acquiredItems"> = {},
): boolean {
  if (!condition) return true;
  const availability = assumeIgnoredLeavesMet(condition, false);
  const day = { ...progressContext(ctx.progressionState), ...ctx.worldState, ...facts };
  return evaluateAvailabilityCondition(availability, day) !== false;
}

// ─── Source-level availability ──────────────────────────────────────

/**
 * Get a merged, deduplicated set of display badges from a list of sources.
 */
export function getDisplayBadges(sources: Source[]): DisplayBadges {
  const merged: DisplayBadges = {};
  for (const source of sources) {
    const availability = getAvailabilityCondition(source);
    if (!availability) continue;
    const badges = extractDisplayBadges(availability);
    if (badges.seasons && !merged.seasons) merged.seasons = badges.seasons;
    if (badges.weathers && !merged.weathers) merged.weathers = badges.weathers;
    if (badges.timeRange && !merged.timeRange) merged.timeRange = badges.timeRange;
  }
  return merged;
}

/**
 * Rewrites the leaves the row rule ignores (time of day, & gates the app can't evaluate) so they
 * read as met: "always" where they appear plainly, & "never" under an odd number of negations.
 */
function assumeIgnoredLeavesMet(
  condition: AvailabilityCondition,
  negated: boolean,
): AvailabilityCondition {
  switch (condition.type) {
    case "all":
    case "any":
      return {
        type: condition.type,
        conditions: condition.conditions.map((child) => assumeIgnoredLeavesMet(child, negated)) as [
          AvailabilityCondition,
          ...AvailabilityCondition[],
        ],
      };
    case "dateUnlocked":
    case "gamePredicate":
    case "time":
      return negated ? { type: "not", condition: { type: "always" } } : { type: "always" };
    case "always":
    case "hasUpperFloor":
    case "heartLevel":
    case "isDating":
    case "itemAcquired":
    case "mineFloor":
    case "perkUnlocked":
    case "quest":
    case "reachedSeason":
    case "renownLevel":
    case "season":
    case "skillLevel":
    case "weather":
      return condition;
    case "not":
      return { type: "not", condition: assumeIgnoredLeavesMet(condition.condition, !negated) };
  }
}

/**
 * Source variants that carry no `SourceDetails` (e.g. `{ type: "default" }`) have no
 * `availability` field at all, so it can't be accessed directly on the union type.
 */
function getAvailabilityCondition(source: Source): AvailabilityCondition | undefined {
  return "availability" in source ? source.availability : undefined;
}

function getSourceVisibility(source: Source): undefined | VisibilityCondition {
  return "visibility" in source ? source.visibility : undefined;
}

/**
 * The progress facts the app records, as evaluator lookups. Unrecorded levels are zero & quests
 * outside the player's reach are "unavailable", so neither reads as an unknown, met gate.
 */
function progressContext(state: UserProgressionState): AvailabilityContext {
  return {
    hasUpperFloor: state.hasUpperFloor,
    heartLevels: { get: (villagerId) => state.heartLevels[villagerId] ?? 0 },
    isDating: state.isDating,
    mineFloor: state.mineFloor,
    questStates: { get: (questId) => state.questVisibility[questId] },
    reachedSeason: state.reachedSeason,
    renown: state.renown,
    skillLevels: { get: (skillId) => state.skillLevels[skillId] ?? 0 },
    unlockedPerks: state.unlockedPerks,
  };
}
