import { forEachQuest, TRACKED_QUEST_GROUPS } from "../extractor-helpers.js";

import type { ParsedGameData } from "../parse-fiddle.js";
import type { AcquisitionReferenceRegistries } from "./reference-index.js";

/**
 * Festival activities the collectors name, keyed by the `misc` tables that encode each one. The
 * game has no activity registry of its own, so an activity ID is real only while one of its
 * backing tables exists.
 */
export const FESTIVAL_ACTIVITY_TABLES = {
  animal_contest: ["small_animal_festival_rewards", "large_animal_festival_rewards"],
  pumpkin_patch: ["pumpkin_patch_options"],
} as const satisfies Record<string, readonly string[]>;

/**
 * Builds reference registries for ID kinds that have no extracted `TrackerData` registry, reading
 * only parsed game tables. Acquisition sources (including reviewed overrides) never contribute IDs
 * here, so a misspelled override cannot validate itself.
 *
 * `dialogueChoices` and `dungeonLootGroups` are deliberately absent: no parsed table enumerates
 * them, so any reference to either kind is unresolved until one is identified.
 */
export function collectNativeReferenceRegistries(
  fiddle: ParsedGameData,
): AcquisitionReferenceRegistries {
  return {
    activities: collectActivities(fiddle),
    cutscenes: tableKeys(fiddle, "cutscenes"),
    dates: tableKeys(fiddle, "dates"),
    letters: fiddle.letters === undefined ? [] : tableKeys(fiddle, "letters"),
    locations: tableKeys(fiddle, "locations"),
    monsters: nestedTableKeys(fiddle, "monsters"),
    quests: collectQuests(fiddle),
    stations: nestedTableKeys(fiddle, "object_prototypes"),
    treasureChestTiers: tableKeys(requireTable(fiddle, "fishing"), "chest_tables", "fishing"),
    waterTypes: collectWaterTypes(fiddle),
  };
}

function collectActivities(fiddle: ParsedGameData): string[] {
  const misc = requireTable(fiddle, "misc");
  return Object.entries(FESTIVAL_ACTIVITY_TABLES)
    .filter(([activityId, tables]) =>
      tables.some((table) => {
        const value = misc[table];
        if (value === undefined) return false;
        if (!Array.isArray(value)) {
          throw new TypeError(
            `Expected misc.${table} to be an array backing activity "${activityId}", got ${describe(value)}`,
          );
        }
        return true;
      }),
    )
    .map(([activityId]) => activityId);
}

function collectQuests(fiddle: ParsedGameData): string[] {
  requireTable(fiddle, "quests");
  const ids: string[] = [];
  forEachQuest(fiddle, TRACKED_QUEST_GROUPS, (_group, questId) => ids.push(questId));
  return ids;
}

function collectWaterTypes(fiddle: ParsedGameData): string[] {
  const waterTypes = new Set<string>();
  for (const [fishId, fish] of Object.entries(requireTable(fiddle, "fish"))) {
    if (fishId === "default") continue;
    if (!isRecord(fish)) throw new TypeError(`Expected fish.${fishId} to be a table`);
    const waterType = fish.water_type;
    if (waterType === undefined) continue;
    const values: unknown[] = Array.isArray(waterType) ? waterType : [waterType];
    for (const value of values) {
      if (typeof value !== "string") {
        throw new TypeError(
          `Expected fish.${fishId}.water_type to hold strings, got ${describe(value)}`,
        );
      }
      waterTypes.add(value);
    }
  }
  return [...waterTypes];
}

function describe(value: unknown): string {
  if (value === null) return "null";
  return Array.isArray(value) ? "array" : typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every `<table>.<group>.<id>` key, excluding `default` rows at either level. */
function nestedTableKeys(fiddle: ParsedGameData, key: string): string[] {
  return Object.entries(requireTable(fiddle, key))
    .filter(([groupId]) => groupId !== "default")
    .flatMap(([groupId, group]) => {
      if (!isRecord(group)) {
        throw new TypeError(`Expected ${key}.${groupId} to be a table, got ${describe(group)}`);
      }
      return Object.keys(group).filter((id) => id !== "default");
    });
}

function requireTable(
  parent: Readonly<Record<string, unknown>>,
  key: string,
  parentPath?: string,
): Record<string, unknown> {
  const value = parent[key];
  const path = parentPath ? `${parentPath}.${key}` : key;
  if (!isRecord(value)) {
    throw new TypeError(`Expected game table ${path} to be a table, got ${describe(value)}`);
  }
  return value;
}

/** Every `<table>.<id>` key, excluding the `default` template row. */
function tableKeys(
  parent: Readonly<Record<string, unknown>>,
  key: string,
  parentPath?: string,
): string[] {
  return Object.keys(requireTable(parent, key, parentPath)).filter((id) => id !== "default");
}
