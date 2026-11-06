import { simplifyAvailabilityCondition } from "#lib/engine/availability-condition.js";
import { SEASONS } from "#lib/types/tracker-data.js";

import { projectRequirementExpressionToAvailability } from "../acquisition/requirement-projector.js";
import { expectNumber, expectRecord, expectString, expectStringArray } from "../data-shapes.js";
import { forEachQuest, QUEST_TYPE_BY_GROUP, TRACKED_QUEST_GROUPS } from "../extractor-helpers.js";
import { getCutsceneRecords, sourceFileFor } from "../parse/parse-fiddle.js";
import { createRequirementContext, parseRequirements } from "../parse/requirements.js";

import type {
  AvailabilityCondition,
  ItemId,
  QuestId,
  Season,
  TrackerData,
} from "#lib/types/tracker-data.js";

import type { SourceFieldLocation } from "../data-shapes.js";
import type { TrackedQuestGroup } from "../extractor-helpers.js";
import type { ParsedGameData } from "../parse/parse-fiddle.js";
import type { RequirementExpression } from "../parse/requirements.js";
import type { CutsceneQuestMap } from "./cutscene-quest-map.js";

// Reviewed native predicates that can gate a quest start. Untracked facts remain explicit
// gamePredicate leaves. A new predicate requires review even if requirements.toml declares it.
const QUEST_PREDICATES = new Set([
  "acquired_item",
  "completed_quest",
  "earned_gold",
  "has_any_animal",
  "has_barn",
  "has_coop",
  "has_perk",
  "has_upper_floor",
  "in_time_range",
  "is_dating_someone",
  "is_day_type",
  "is_season",
  "is_weather",
  "reached_date",
  "reached_heart_level",
  "reached_mines_level",
  "reached_renown_level",
  "reached_skill_level",
  "received_letter",
  "seen_cutscene",
  "unlocked_animal",
  "world_fact_is",
]);

/**
 * RequestBoard.gml, Inbox.gml and Mist.gml gate quest activation outside the quest's stage
 * list. Several letters/scenes can start the same quest: those are alternatives, never siblings
 * of an AND. Stage requirements describe finishing a quest, so they aren't extracted here.
 */
export function assignQuestRequirements(
  fiddle: ParsedGameData,
  quests: TrackerData["quests"],
  cutsceneMap: CutsceneQuestMap,
): void {
  const context = createRequirementContext(
    fiddle.requirements as Record<string, unknown> | undefined,
    cutsceneMap,
  );
  const cutscenes = getCutsceneRecords(fiddle);
  const starts = new Map<string, AvailabilityCondition[]>();

  function project(
    raw: unknown,
    location: SourceFieldLocation,
    questId: string | undefined,
    scenes: string[] = [],
  ): AvailabilityCondition {
    const expression = parseRequirements(
      raw,
      context.namedRequirements,
      context.primitivePredicates,
      location,
    );
    return visit(expression, location, questId, scenes);
  }

  function visit(
    expression: RequirementExpression,
    location: SourceFieldLocation,
    questId: string | undefined,
    scenes: string[],
  ): AvailabilityCondition {
    if ("all" in expression) {
      return combine(
        "all",
        expression.all.map((child) => visit(child, location, questId, scenes)),
      );
    }
    if ("any" in expression) {
      return combine(
        "any",
        expression.any.map((child) => visit(child, location, questId, scenes)),
      );
    }
    if ("not" in expression) {
      return { type: "not", condition: visit(expression.not, location, questId, scenes) };
    }
    const { predicate, value } = expression;
    if (!QUEST_PREDICATES.has(predicate)) {
      throw new Error(
        `Unrecognized quest requirement "${predicate}" at ${location.entityId}.${location.fieldPath} in ${location.sourcePath}`,
      );
    }
    const projected = projectRequirementExpressionToAvailability(expression, context, location);
    if (predicate === "reached_renown_level") {
      return { type: "renownLevel", level: expectNumber(value, location) };
    }
    // A setup scene can map to the very quest we're unlocking. Follow its own native gates,
    // rather than requiring that quest to already be available to start itself.
    if (predicate === "seen_cutscene") {
      const ids = typeof value === "string" ? [value] : expectStringArray(value, location);
      return combine(
        "all",
        ids.map((id) => {
          if (
            questId !== undefined &&
            cutsceneMap[id]?.questId === questId &&
            cutsceneMap[id].phase === "available" &&
            cutscenes[id]
          ) {
            if (scenes.includes(id)) {
              throw new Error(`Cyclic quest setup cutscene ${id} in ${location.sourcePath}`);
            }
            return project(
              cutscenes[id].requirements,
              {
                entityId: id,
                fieldPath: "requirements",
                sourcePath: sourceFileFor(fiddle, "cutscenes"),
              },
              questId,
              [...scenes, id],
            );
          }
          return projectRequirementExpressionToAvailability(
            { predicate, value: id },
            context,
            location,
          );
        }),
      );
    }
    if (predicate === "acquired_item") {
      const ids = typeof value === "string" ? [value] : expectStringArray(value, location);
      return combine(
        "all",
        ids.map((itemId) => ({ type: "itemAcquired", itemId: itemId as ItemId })),
      );
    }
    if (predicate === "completed_quest" && typeof value !== "string") {
      if (Array.isArray(value)) {
        return combine(
          "all",
          value.map((entry) => visit({ predicate, value: entry }, location, questId, scenes)),
        );
      }
      const record = expectRecord(value, location);
      const id = expectString(record.quest, location) as QuestId;
      return combine("all", [{ type: "quest", questId: id, state: "completed" }, projected]);
    }
    if (predicate === "reached_date" && typeof value === "object") {
      const record = expectRecord(value, location);
      const season = expectString(record.season, location) as Season;
      if (!SEASONS.includes(season)) {
        throw new Error(`Unknown quest season ${season} in ${location.sourcePath}`);
      }
      return combine("all", [
        record.exact === true
          ? { type: "season", seasons: [season] }
          : { type: "reachedSeason", season },
        projected,
      ]);
    }
    return projected;
  }

  function addStart(id: string, raw: unknown, location: SourceFieldLocation): void {
    const entries = starts.get(id) ?? [];
    entries.push(project(raw, location, id));
    starts.set(id, entries);
  }

  const groups = fiddle.quests as Record<string, Record<string, unknown>> | undefined;
  for (const [id, raw] of Object.entries(groups?.request_board ?? {})) {
    if (id === "default") continue;
    const location = {
      entityId: id,
      fieldPath: "requirements",
      sourcePath: sourceFileFor(fiddle, "quests.request_board"),
    };
    addStart(id, expectRecord(raw, location).requirements, location);
  }
  for (const [root, records] of [
    ["letters", fiddle.letters ?? {}],
    ["cutscenes", cutscenes],
  ] as const) {
    for (const [id, raw] of Object.entries(records)) {
      if (id === "default") continue;
      const location = {
        entityId: id,
        fieldPath: "requirements",
        sourcePath: sourceFileFor(fiddle, root),
      };
      const entry = expectRecord(raw, location);
      if (entry.quest_to_start === undefined) continue;
      const ids =
        typeof entry.quest_to_start === "string"
          ? [entry.quest_to_start]
          : expectStringArray(entry.quest_to_start, location);
      for (const questId of ids) addStart(questId, entry.requirements, location);
    }
  }

  forEachQuest(fiddle, TRACKED_QUEST_GROUPS, (group, id) => {
    const quest = quests[QUEST_TYPE_BY_GROUP[group as TrackedQuestGroup]][id as QuestId];
    if (!quest) throw new Error(`Quest ${id} is absent from extracted ${group}`);
    const routes = starts.get(id);
    if (!routes) return;
    // An unconstrained start is the schema default, so it's omitted rather than stored.
    const start = combine("any", routes);
    if (start.type !== "always") quest.startCondition = start;
  });
}

function combine(type: "all" | "any", all: AvailabilityCondition[]): AvailabilityCondition {
  // A "never" alternative can't make an "any" true, so it's dropped rather than stored.
  const conditions = type === "any" ? all.filter((condition) => !isNever(condition)) : all;
  if (conditions.length === 0) {
    return type === "all" ? { type: "always" } : { type: "not", condition: { type: "always" } };
  }
  return (
    simplifyAvailabilityCondition({
      type,
      conditions: conditions as [AvailabilityCondition, ...AvailabilityCondition[]],
    }) ?? { type: "always" }
  );
}

function isNever(condition: AvailabilityCondition): boolean {
  return condition.type === "not" && condition.condition.type === "always";
}
