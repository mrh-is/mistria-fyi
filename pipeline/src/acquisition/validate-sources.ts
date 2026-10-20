import {
  CUTSCENE_SOURCE_IDS,
  DATE_INSPIRATION_DROP_ACTIVITIES,
  UPGRADE_IDS,
} from "#lib/types/acquisition.js";
import { SEASONS, WEATHERS } from "#lib/types/tracker-data.js";

import { compareStrings } from "../ordering.js";
import { getSourceProvenance } from "./source-accumulator.js";

import type { AvailabilityCondition, Source } from "#lib/types/acquisition.js";
import type { QuestType, TrackerData } from "#lib/types/tracker-data.js";
import type { VisibilityCondition } from "#lib/types/visibility.js";

import type { AcquisitionReferenceIndex, AcquisitionReferenceKind } from "./reference-index.js";

/**
 * The assembled tracker data the validator walks. It is the real `TrackerData` contract with no
 * cast; every field is still checked at runtime because extraction and overrides are untyped.
 */
export type AcquisitionSourceAssembly = Pick<
  TrackerData,
  | "almanac"
  | "animals"
  | "categoryVisibility"
  | "cosmetics"
  | "items"
  | "mines"
  | "mount"
  | "museum"
  | "pets"
  | "quests"
  | "recipes"
  | "stores"
  | "villagers"
>;

export interface AcquisitionSourceDiagnostic {
  fieldPath: string;
  kind: AcquisitionSourceDiagnosticKind;
  message: string;
  sourceFieldPath?: string;
  sourcePath?: string;
  targetId: string;
}

export type AcquisitionSourceDiagnosticKind =
  | "excluded-id-reference"
  | "malformed-payload"
  | "missing-source"
  | "recipe-cycle"
  | "unresolved-reference";

/** Options for one collection of entities that carry `sources` and an optional `visibility`. */
interface EntityCollectionOptions {
  /** Emits `missing-source` when an entity has an empty `sources` array. */
  missingSourceLabel?: string;
  /** The registry each entity's own ID must resolve in. */
  selfKind?: AcquisitionReferenceKind;
}

type QuestFieldRule =
  | { type: "heartLevelChanges"; field: string; required: boolean }
  | { type: "number"; field: string; required: boolean }
  | { type: "reference"; field: string; kind: AcquisitionReferenceKind; required: boolean };

const DIAGNOSTIC_ORDER: Record<AcquisitionSourceDiagnosticKind, number> = {
  "excluded-id-reference": 3,
  "malformed-payload": 1,
  "missing-source": 0,
  "recipe-cycle": 4,
  "unresolved-reference": 2,
};

const AVAILABILITY_FIELDS = {
  all: ["conditions"],
  always: [],
  any: ["conditions"],
  dateUnlocked: ["dateId"],
  gamePredicate: ["predicate", "value"],
  hasUpperFloor: [],
  heartLevel: ["level", "villagerId"],
  isDating: [],
  mineFloor: ["floor"],
  not: ["condition"],
  perkUnlocked: ["perkId"],
  quest: ["questId", "state"],
  reachedSeason: ["season"],
  season: ["seasons"],
  skillLevel: ["level", "skillId"],
  time: ["end", "start"],
  weather: ["weathers"],
} as const satisfies Record<AvailabilityCondition["type"], readonly string[]>;

const VISIBILITY_FIELDS = {
  always: [],
  and: ["conditions"],
  hasUpperFloor: [],
  heartLevel: ["level", "villagerId"],
  isDating: [],
  married: ["villagerId"],
  mineFloor: ["floor"],
  or: ["conditions"],
  perkUnlocked: ["perkId"],
  questAvailable: ["questId"],
  questCompleted: ["questId"],
  reachedSeason: ["season"],
  renownLevel: ["level"],
  skillLevel: ["level", "skillId"],
  villagerKnown: ["villagerId"],
} as const satisfies Record<VisibilityCondition["type"], readonly string[]>;

/** Per-quest-type fields beyond `sources` & `visibility`, mirroring `QuestTypeMap`. */
const QUEST_FIELDS = {
  cooking: [{ type: "reference", field: "recipeId", kind: "recipe", required: true }],
  crown: [],
  fetch: [
    { type: "reference", field: "itemId", kind: "item", required: true },
    { type: "reference", field: "rewardRecipeId", kind: "recipe", required: false },
    { type: "reference", field: "villager", kind: "villager", required: true },
  ],
  heart: [
    { type: "number", field: "heartLevel", required: true },
    { type: "reference", field: "villager", kind: "villager", required: true },
  ],
  mission: [],
  story: [{ type: "heartLevelChanges", field: "heartLevelChanges", required: false }],
} as const satisfies Record<QuestType, readonly QuestFieldRule[]>;

const SEASON_VALUES = new Set<string>(SEASONS);
const WEATHER_VALUES = new Set<string>(WEATHERS);

const SOURCE_FIELDS = {
  animal_product: ["animalId"],
  artifact_dig: ["locationIds"],
  artifact_replicator: ["originalItemId"],
  bait_fish: ["baitItemIds"],
  breed: [],
  bug_catch: ["locationIds"],
  chicken_statue: [],
  crop: ["seedItemId"],
  cutscene: ["cutsceneId"],
  date: ["dateId"],
  date_inspiration: ["itemId"],
  date_inspiration_drop: ["activity", "dateId", "locationId"],
  default: [],
  dive: ["waterTypes"],
  donate_item: ["triggerItemId"],
  engagement: [],
  equipment: ["itemId"],
  festival: ["festivalId", "storeId"],
  festival_activity: ["activityId", "festivalId"],
  fish: ["waterTypes"],
  fish_trap: ["baitItemIds"],
  forage: ["locationIds"],
  horse_statue: ["cost", "questId"],
  letter: ["letterId", "trigger"],
  lost_and_found: [],
  mine: ["biomeId"],
  mine_fish: ["biomeId"],
  mines_chest: ["biomeId", "lootGroup", "perkId"],
  mines_dig_site: ["biomeId", "perkId"],
  monster: ["monsterId"],
  monster_feed: ["monsterId"],
  museum_donation: ["setCount", "wingId"],
  perk: ["perkId"],
  perk_drop: ["activity", "perkId"],
  proposal: ["villagerId"],
  quest: ["challengeRecipeId", "choiceId", "questId", "questType", "requestedItemId", "trigger"],
  reach_day: ["triggerDate"],
  recipe: ["method", "recipeId"],
  renown: ["level"],
  ritual_chamber: ["perkId"],
  scroll_bundle: ["bundleItemId", "storeId"],
  secret_chest: ["locationId"],
  ship_item: ["triggerItemId"],
  spouseGift: ["villagerId"],
  station: ["stationId"],
  store: ["storeId"],
  treasure_chest: ["tier"],
  tree: ["saplingItemId"],
  upgrade: ["storeId", "upgradeId"],
  wedding: [],
  wishing_well: ["cost"],
} as const satisfies Record<Source["type"], readonly string[]>;

const SOURCE_TYPES = new Set<string>(Object.keys(SOURCE_FIELDS));
const SOURCE_DETAIL_FIELDS = ["availability", "cost", "visibility", "weight"];

export class AcquisitionSourceValidationError extends Error {
  readonly diagnostics: AcquisitionSourceDiagnostic[];

  constructor(diagnostics: AcquisitionSourceDiagnostic[]) {
    super(
      `Acquisition source validation failed with ${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"}:\n${diagnostics
        .map(
          (diagnostic) =>
            `[${diagnostic.kind}] ${diagnostic.targetId} at ${diagnostic.fieldPath}: ${diagnostic.message}${
              diagnostic.sourcePath
                ? ` (from ${diagnostic.sourceFieldPath} in ${diagnostic.sourcePath})`
                : ""
            }`,
        )
        .join("\n")}`,
    );
    this.diagnostics = diagnostics;
    this.name = "AcquisitionSourceValidationError";
  }
}

export function validateAcquisitionSources(
  trackerData: AcquisitionSourceAssembly,
  references: AcquisitionReferenceIndex,
): void {
  const diagnostics: AcquisitionSourceDiagnostic[] = [];
  const data = trackerData as Readonly<Record<keyof AcquisitionSourceAssembly, unknown>>;

  validateEntities("cosmetics", data.cosmetics, references, diagnostics, {
    missingSourceLabel: "Cosmetic",
    selfKind: "cosmetic",
  });
  validateEntities("items", data.items, references, diagnostics, {
    missingSourceLabel: "Item",
    selfKind: "item",
  });
  validateEntities("recipes", data.recipes, references, diagnostics, {
    missingSourceLabel: "Recipe",
    selfKind: "recipe",
  });
  validateAnimals(data.animals, references, diagnostics);
  validatePets(data.pets, references, diagnostics);
  validateMount(data.mount, references, diagnostics);
  validateSpells(data.mines, references, diagnostics);
  validateQuests(data.quests, references, diagnostics);
  validateVisibilityOnly("stores", data.stores, references, diagnostics);
  validateVisibilityOnly("villagers", data.villagers, references, diagnostics);
  validateCategoryVisibility(data.categoryVisibility, references, diagnostics);
  validateAlmanac(data.almanac, references, diagnostics);
  validateMuseum(data.museum, references, diagnostics);
  validateRecipeCycles(data.recipes, diagnostics);

  diagnostics.sort(compareDiagnostics);
  if (diagnostics.length > 0) throw new AcquisitionSourceValidationError(diagnostics);
}

function compareDiagnostics(
  left: AcquisitionSourceDiagnostic,
  right: AcquisitionSourceDiagnostic,
): number {
  return (
    DIAGNOSTIC_ORDER[left.kind] - DIAGNOSTIC_ORDER[right.kind] ||
    compareStrings(left.targetId, right.targetId) ||
    compareStrings(left.fieldPath, right.fieldPath) ||
    compareStrings(left.message, right.message) ||
    compareStrings(left.sourcePath ?? "", right.sourcePath ?? "")
  );
}

function findRecipeCycle(
  recipeId: string,
  graph: ReadonlyMap<string, readonly string[]>,
  visiting: Set<string>,
  resolved: Set<string>,
  stack: string[],
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  if (resolved.has(recipeId)) return;
  if (visiting.has(recipeId)) {
    const cycleStart = stack.indexOf(recipeId);
    const cycle = [...stack.slice(cycleStart), recipeId];
    diagnostics.push({
      fieldPath: `recipes.${recipeId}.sources`,
      kind: "recipe-cycle",
      message: `Recipe source cycle: ${cycle.join(" -> ")}`,
      targetId: recipeId,
    });
    return;
  }

  visiting.add(recipeId);
  stack.push(recipeId);
  for (const dependency of graph.get(recipeId) ?? []) {
    findRecipeCycle(dependency, graph, visiting, resolved, stack, diagnostics);
  }
  stack.pop();
  visiting.delete(recipeId);
  resolved.add(recipeId);
}

function getDenseJsonArrayValues(value: unknown): undefined | unknown[] {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length > 0
  ) {
    return undefined;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const values: unknown[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[index];
    if (!descriptor?.enumerable || !("value" in descriptor)) return undefined;
    values.push(descriptor.value);
  }
  const validDescriptors = Object.entries(descriptors).every(([key, descriptor]) => {
    if (key === "length") return true;
    const index = Number(key);
    return (
      Number.isInteger(index) &&
      index >= 0 &&
      index < value.length &&
      String(index) === key &&
      descriptor.enumerable &&
      "value" in descriptor
    );
  });
  return validDescriptors ? values : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isJsonValue(value: unknown, active: Set<object>): boolean {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    isFiniteNumber(value)
  ) {
    return true;
  }
  if (typeof value !== "object" || active.has(value)) return false;
  active.add(value);
  try {
    if (Array.isArray(value)) {
      const entries = getDenseJsonArrayValues(value);
      if (!entries) return false;
      for (const entry of entries) {
        if (!isJsonValue(entry, active)) return false;
      }
      return true;
    }
    if (Object.getOwnPropertySymbols(value).length > 0) return false;
    if (!isRecord(value)) return false;
    return Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) =>
        descriptor.enumerable && "value" in descriptor && isJsonValue(descriptor.value, active),
    );
  } finally {
    active.delete(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function malformed(
  diagnostics: AcquisitionSourceDiagnostic[],
  targetId: string,
  fieldPath: string,
  message: string,
  source: object | undefined,
): void {
  const provenance = source ? getSourceProvenance(source, fieldPath) : undefined;
  diagnostics.push({
    fieldPath,
    kind: "malformed-payload",
    message,
    ...(provenance
      ? { sourceFieldPath: provenance.fieldPath, sourcePath: provenance.sourcePath }
      : {}),
    targetId,
  });
}

function optionalNumber(
  value: Record<string, unknown>,
  field: string,
  targetId: string,
  fieldPath: string,
  source: object,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  if (field in value) requireNumber(value, field, targetId, fieldPath, source, diagnostics);
}

function optionalReference(
  source: Record<string, unknown>,
  field: string,
  kind: AcquisitionReferenceKind,
  targetId: string,
  fieldPath: string,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  if (!(field in source)) return;
  if (requireString(source, field, targetId, fieldPath, source, diagnostics)) {
    reference(
      diagnostics,
      references,
      kind,
      source[field],
      targetId,
      `${fieldPath}.${field}`,
      source,
    );
  }
}

function optionalReferenceArray(
  source: Record<string, unknown>,
  field: string,
  kind: AcquisitionReferenceKind,
  targetId: string,
  fieldPath: string,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  if (!(field in source)) return;
  if (requireStringArray(source, field, targetId, fieldPath, source, diagnostics)) {
    for (const [index, id] of (source[field] as string[]).entries()) {
      reference(
        diagnostics,
        references,
        kind,
        id,
        targetId,
        `${fieldPath}.${field}[${index}]`,
        source,
      );
    }
  }
}

function reference(
  diagnostics: AcquisitionSourceDiagnostic[],
  references: AcquisitionReferenceIndex,
  kind: AcquisitionReferenceKind,
  id: unknown,
  targetId: string,
  fieldPath: string,
  source?: object,
): void {
  if (typeof id !== "string") {
    malformed(
      diagnostics,
      targetId,
      fieldPath,
      `Expected a string ${referenceLabel(kind)} ID`,
      source,
    );
    return;
  }
  const provenance = source ? getSourceProvenance(source, fieldPath) : undefined;
  if (references.isExcluded(kind, id)) {
    diagnostics.push({
      fieldPath,
      kind: "excluded-id-reference",
      message: `Excluded ${referenceLabel(kind)} ID "${id}" is still referenced`,
      ...(provenance
        ? { sourceFieldPath: provenance.fieldPath, sourcePath: provenance.sourcePath }
        : {}),
      targetId,
    });
  } else if (!references.has(kind, id)) {
    diagnostics.push({
      fieldPath,
      kind: "unresolved-reference",
      message: `Unknown ${referenceLabel(kind)} ID "${id}"`,
      ...(provenance
        ? { sourceFieldPath: provenance.fieldPath, sourcePath: provenance.sourcePath }
        : {}),
      targetId,
    });
  }
}

function referenceLabel(kind: AcquisitionReferenceKind): string {
  return kind.replaceAll(/[A-Z]/g, (character) => ` ${character.toLowerCase()}`);
}

function requiredReferenceArray(
  source: Record<string, unknown>,
  field: string,
  kind: AcquisitionReferenceKind,
  targetId: string,
  fieldPath: string,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  if (requireStringArray(source, field, targetId, fieldPath, source, diagnostics)) {
    for (const [index, id] of (source[field] as string[]).entries()) {
      reference(
        diagnostics,
        references,
        kind,
        id,
        targetId,
        `${fieldPath}.${field}[${index}]`,
        source,
      );
    }
  }
}

function requireNumber(
  value: Record<string, unknown>,
  field: string,
  targetId: string,
  fieldPath: string,
  source: object | undefined,
  diagnostics: AcquisitionSourceDiagnostic[],
): boolean {
  if (isFiniteNumber(value[field])) return true;
  malformed(diagnostics, targetId, `${fieldPath}.${field}`, "Expected a finite number", source);
  return false;
}

function requireString(
  value: Record<string, unknown>,
  field: string,
  targetId: string,
  fieldPath: string,
  source: object | undefined,
  diagnostics: AcquisitionSourceDiagnostic[],
): boolean {
  if (typeof value[field] === "string") return true;
  malformed(diagnostics, targetId, `${fieldPath}.${field}`, "Expected a string", source);
  return false;
}

function requireStringArray(
  value: Record<string, unknown>,
  field: string,
  targetId: string,
  fieldPath: string,
  source: object | undefined,
  diagnostics: AcquisitionSourceDiagnostic[],
): string[] | undefined {
  const entries = getDenseJsonArrayValues(value[field]);
  if (entries) {
    for (const entry of entries) {
      if (typeof entry !== "string") {
        malformed(
          diagnostics,
          targetId,
          `${fieldPath}.${field}`,
          "Expected an array of strings",
          source,
        );
        return undefined;
      }
    }
    return entries as string[];
  }
  malformed(diagnostics, targetId, `${fieldPath}.${field}`, "Expected an array of strings", source);
  return undefined;
}

function validateAvailability(
  value: unknown,
  targetId: string,
  fieldPath: string,
  source: object,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
  active: Set<object>,
): void {
  if (!isRecord(value)) {
    malformed(diagnostics, targetId, fieldPath, "Expected an availability object", source);
    return;
  }
  if (active.has(value)) {
    malformed(diagnostics, targetId, fieldPath, "Expected an acyclic availability tree", source);
    return;
  }
  if (!validateAvailabilityPropertyShape(value, targetId, fieldPath, source, diagnostics)) return;
  const type = value.type;
  if (typeof type === "string" && type in AVAILABILITY_FIELDS) {
    const allowedFields = new Set([
      "type",
      ...AVAILABILITY_FIELDS[type as AvailabilityCondition["type"]],
    ]);
    for (const key of Object.getOwnPropertyNames(value)) {
      if (!allowedFields.has(key)) {
        malformed(
          diagnostics,
          targetId,
          `${fieldPath}.${key}`,
          `Unexpected field for ${type} availability`,
          source,
        );
      }
    }
  }
  active.add(value);
  try {
    switch (type) {
      case "all":
      case "any": {
        const conditions = getDenseJsonArrayValues(value.conditions);
        if (conditions) {
          for (let index = 0; index < conditions.length; index++) {
            validateAvailability(
              conditions[index],
              targetId,
              `${fieldPath}.conditions[${index}]`,
              source,
              references,
              diagnostics,
              active,
            );
          }
        } else {
          malformed(
            diagnostics,
            targetId,
            `${fieldPath}.conditions`,
            "Expected a dense JSON array of availability conditions",
            source,
          );
        }
        break;
      }
      case "always":
        return;
      case "dateUnlocked":
        if (
          "dateId" in value &&
          requireString(value, "dateId", targetId, fieldPath, source, diagnostics)
        ) {
          reference(
            diagnostics,
            references,
            "date",
            value.dateId,
            targetId,
            `${fieldPath}.dateId`,
            source,
          );
        }
        return;
      case "gamePredicate":
        requireString(value, "predicate", targetId, fieldPath, source, diagnostics);
        if (!isJsonValue(value.value, new Set())) {
          malformed(diagnostics, targetId, `${fieldPath}.value`, "Expected a JSON value", source);
        }
        break;
      case "hasUpperFloor":
      case "isDating":
        return;
      case "heartLevel":
        requireNumber(value, "level", targetId, fieldPath, source, diagnostics);
        if (requireString(value, "villagerId", targetId, fieldPath, source, diagnostics)) {
          reference(
            diagnostics,
            references,
            "villager",
            value.villagerId,
            targetId,
            `${fieldPath}.villagerId`,
            source,
          );
        }
        return;
      case "mineFloor":
        requireNumber(value, "floor", targetId, fieldPath, source, diagnostics);
        return;
      case "not":
        validateAvailability(
          value.condition,
          targetId,
          `${fieldPath}.condition`,
          source,
          references,
          diagnostics,
          active,
        );
        return;
      case "perkUnlocked":
        if (requireString(value, "perkId", targetId, fieldPath, source, diagnostics)) {
          reference(
            diagnostics,
            references,
            "perk",
            value.perkId,
            targetId,
            `${fieldPath}.perkId`,
            source,
          );
        }
        return;
      case "quest":
        if (requireString(value, "questId", targetId, fieldPath, source, diagnostics)) {
          reference(
            diagnostics,
            references,
            "quest",
            value.questId,
            targetId,
            `${fieldPath}.questId`,
            source,
          );
        }
        if (value.state !== "available" && value.state !== "completed") {
          malformed(
            diagnostics,
            targetId,
            `${fieldPath}.state`,
            'Expected "available" or "completed"',
            source,
          );
        }
        return;
      case "reachedSeason":
        if (
          requireString(value, "season", targetId, fieldPath, source, diagnostics) &&
          !SEASON_VALUES.has(value.season as string)
        ) {
          malformed(
            diagnostics,
            targetId,
            `${fieldPath}.season`,
            `Unknown season "${value.season as string}"`,
            source,
          );
        }
        return;
      case "season": {
        const seasons = requireStringArray(
          value,
          "seasons",
          targetId,
          fieldPath,
          source,
          diagnostics,
        );
        for (const [index, season] of (seasons ?? []).entries()) {
          if (!SEASON_VALUES.has(season)) {
            malformed(
              diagnostics,
              targetId,
              `${fieldPath}.seasons[${index}]`,
              `Unknown season "${season}"`,
              source,
            );
          }
        }
        return;
      }
      case "skillLevel":
        requireNumber(value, "level", targetId, fieldPath, source, diagnostics);
        if (requireString(value, "skillId", targetId, fieldPath, source, diagnostics)) {
          reference(
            diagnostics,
            references,
            "skill",
            value.skillId,
            targetId,
            `${fieldPath}.skillId`,
            source,
          );
        }
        return;
      case "time":
        requireNumber(value, "end", targetId, fieldPath, source, diagnostics);
        requireNumber(value, "start", targetId, fieldPath, source, diagnostics);
        return;
      case "weather": {
        const weathers = requireStringArray(
          value,
          "weathers",
          targetId,
          fieldPath,
          source,
          diagnostics,
        );
        for (const [index, weather] of (weathers ?? []).entries()) {
          if (!WEATHER_VALUES.has(weather)) {
            malformed(
              diagnostics,
              targetId,
              `${fieldPath}.weathers[${index}]`,
              `Unknown weather "${weather}"`,
              source,
            );
          }
        }
        return;
      }
      default:
        malformed(
          diagnostics,
          targetId,
          `${fieldPath}.type`,
          "Expected a known availability type",
          source,
        );
    }
  } finally {
    active.delete(value);
  }
}

function validateAvailabilityPropertyShape(
  value: Record<string, unknown>,
  targetId: string,
  fieldPath: string,
  source: object | undefined,
  diagnostics: AcquisitionSourceDiagnostic[],
): boolean {
  let valid = true;
  if (Object.getOwnPropertySymbols(value).length > 0) {
    malformed(
      diagnostics,
      targetId,
      fieldPath,
      "Expected a condition object without symbol properties",
      source,
    );
    valid = false;
  }
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable) {
      malformed(
        diagnostics,
        targetId,
        `${fieldPath}.${key}`,
        "Expected an enumerable data property",
        source,
      );
      valid = false;
    } else if (!("value" in descriptor)) {
      malformed(diagnostics, targetId, `${fieldPath}.${key}`, "Expected a data property", source);
      valid = false;
    }
  }
  return valid;
}

function validateCommonSourceFields(
  source: Record<string, unknown>,
  targetId: string,
  fieldPath: string,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  if ("availability" in source) {
    validateAvailability(
      source.availability,
      targetId,
      `${fieldPath}.availability`,
      source,
      references,
      diagnostics,
      new Set(),
    );
  }
  if ("weight" in source && !isFiniteNumber(source.weight)) {
    malformed(diagnostics, targetId, `${fieldPath}.weight`, "Expected a finite number", source);
  }
  if ("cost" in source) {
    validateCost(source.cost, targetId, `${fieldPath}.cost`, source, diagnostics);
  }
  if ("visibility" in source) {
    validateVisibility(
      source.visibility,
      targetId,
      `${fieldPath}.visibility`,
      source,
      references,
      diagnostics,
      new Set(),
    );
  }
}

function validateCost(
  value: unknown,
  targetId: string,
  fieldPath: string,
  source: object,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  if (!isFiniteNumber(value)) {
    malformed(diagnostics, targetId, fieldPath, "Expected a finite number for cost", source);
  }
}

function validateEntities(
  collectionPath: string,
  entities: unknown,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
  options: EntityCollectionOptions = {},
): void {
  const record = requireRecord(entities, collectionPath, collectionPath, diagnostics);
  if (!record) return;
  for (const [targetId, entity] of sortedEntries(record)) {
    const entityPath = `${collectionPath}.${targetId}`;
    if (options.selfKind) {
      reference(diagnostics, references, options.selfKind, targetId, targetId, entityPath);
    }
    if (!isRecord(entity)) {
      malformed(diagnostics, targetId, entityPath, "Expected an entity object", undefined);
      continue;
    }
    validateEntityVisibility(entity, targetId, entityPath, references, diagnostics);
    const entitySources = entity.sources;
    if (!Array.isArray(entitySources)) {
      malformed(
        diagnostics,
        targetId,
        `${entityPath}.sources`,
        "Expected an array of acquisition sources",
        undefined,
      );
      continue;
    }
    if (options.missingSourceLabel && entitySources.length === 0) {
      diagnostics.push({
        fieldPath: `${entityPath}.sources`,
        kind: "missing-source",
        message: `${options.missingSourceLabel} "${targetId}" has no acquisition sources`,
        targetId,
      });
    }
    for (const [index, source] of entitySources.entries()) {
      validateSource(source, targetId, `${entityPath}.sources[${index}]`, references, diagnostics);
    }
  }
}

function validateReachedDay(
  source: Record<string, unknown>,
  targetId: string,
  fieldPath: string,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  if (isRecord(source.triggerDate)) {
    requireNumber(
      source.triggerDate,
      "day",
      targetId,
      `${fieldPath}.triggerDate`,
      source,
      diagnostics,
    );
    requireString(
      source.triggerDate,
      "season",
      targetId,
      `${fieldPath}.triggerDate`,
      source,
      diagnostics,
    );
    optionalNumber(
      source.triggerDate,
      "year",
      targetId,
      `${fieldPath}.triggerDate`,
      source,
      diagnostics,
    );
  } else {
    malformed(diagnostics, targetId, `${fieldPath}.triggerDate`, "Expected a reached date", source);
  }
}

function validateRecipeCycles(recipes: unknown, diagnostics: AcquisitionSourceDiagnostic[]): void {
  // Shape problems are reported by validateEntities; cycle detection only follows valid edges.
  if (!isRecord(recipes)) return;
  const graph = new Map<string, string[]>();
  for (const [recipeId, recipe] of Object.entries(recipes)) {
    const recipeSources = isRecord(recipe) ? recipe.sources : undefined;
    const dependencies = (Array.isArray(recipeSources) ? recipeSources : [])
      .filter((source) => isRecord(source))
      .filter((source) => source.type === "recipe" && typeof source.recipeId === "string")
      .map((source) => source.recipeId as string)
      .filter((dependency) => dependency in recipes)
      .toSorted((left, right) => compareStrings(left, right));
    graph.set(recipeId, dependencies);
  }

  const resolved = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];
  for (const recipeId of [...graph.keys()].toSorted((left, right) => compareStrings(left, right))) {
    findRecipeCycle(recipeId, graph, visiting, resolved, stack, diagnostics);
  }
}

function validateSource(
  source: unknown,
  targetId: string,
  fieldPath: string,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  if (!isRecord(source)) {
    malformed(diagnostics, targetId, fieldPath, "Expected an acquisition source object", undefined);
    return;
  }
  if (typeof source.type !== "string" || !SOURCE_TYPES.has(source.type)) {
    malformed(
      diagnostics,
      targetId,
      `${fieldPath}.type`,
      "Expected a known acquisition source type",
      source,
    );
    return;
  }

  const allowedFields = new Set([
    "type",
    ...SOURCE_FIELDS[source.type as Source["type"]],
    ...(source.type === "chicken_statue" ? ["cost", "unlockCondition"] : []),
    ...(source.type === "default" ? [] : SOURCE_DETAIL_FIELDS),
  ]);
  for (const field of Object.keys(source)) {
    if (!allowedFields.has(field)) {
      malformed(
        diagnostics,
        targetId,
        `${fieldPath}.${field}`,
        `Unexpected field for ${source.type} source`,
        source,
      );
    }
  }

  validateCommonSourceFields(source, targetId, fieldPath, references, diagnostics);
  validateVariantFields(source, targetId, fieldPath, references, diagnostics);
}

function validateTriggeredItem(
  source: Record<string, unknown>,
  targetId: string,
  fieldPath: string,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  if (requireString(source, "triggerItemId", targetId, fieldPath, source, diagnostics)) {
    reference(
      diagnostics,
      references,
      "item",
      source.triggerItemId,
      targetId,
      `${fieldPath}.triggerItemId`,
      source,
    );
  }
}

function validateVariantFields(
  source: Record<string, unknown>,
  targetId: string,
  fieldPath: string,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  const stringReferences: [string, AcquisitionReferenceKind][] = [];
  const requiredNumbers: string[] = [];
  const requiredStrings: string[] = [];

  switch (source.type) {
    case "animal_product":
      stringReferences.push(["animalId", "animal"]);
      break;
    case "artifact_dig":
    case "bug_catch":
    case "forage":
      optionalReferenceArray(
        source,
        "locationIds",
        "location",
        targetId,
        fieldPath,
        references,
        diagnostics,
      );
      break;
    case "artifact_replicator":
      stringReferences.push(["originalItemId", "item"]);
      break;
    case "bait_fish":
    case "fish_trap":
      requiredReferenceArray(
        source,
        "baitItemIds",
        "item",
        targetId,
        fieldPath,
        references,
        diagnostics,
      );
      break;
    case "chicken_statue":
      if ("cost" in source && "unlockCondition" in source) {
        malformed(
          diagnostics,
          targetId,
          fieldPath,
          "Chicken Statue sources must have either a cost or an unlock condition, not both",
          source,
        );
      } else if ("cost" in source) {
        requireNumber(source, "cost", targetId, fieldPath, source, diagnostics);
      } else if (source.unlockCondition !== "breed_all_chicken_tiers") {
        malformed(
          diagnostics,
          targetId,
          `${fieldPath}.unlockCondition`,
          'Expected unlockCondition "breed_all_chicken_tiers"',
          source,
        );
      }
      break;
    case "crop":
      stringReferences.push(["seedItemId", "item"]);
      break;
    case "date":
      stringReferences.push(["dateId", "date"]);
      break;
    case "cutscene":
      stringReferences.push(["cutsceneId", "cutscene"]);
      if (!(CUTSCENE_SOURCE_IDS as readonly unknown[]).includes(source.cutsceneId)) {
        malformed(
          diagnostics,
          targetId,
          `${fieldPath}.cutsceneId`,
          "Expected a reviewed cutscene id",
          source,
        );
      }
      break;
    case "date_inspiration":
      stringReferences.push(["itemId", "item"]);
      break;
    case "date_inspiration_drop":
      stringReferences.push(["dateId", "date"]);
      if (!(DATE_INSPIRATION_DROP_ACTIVITIES as readonly unknown[]).includes(source.activity)) {
        malformed(
          diagnostics,
          targetId,
          `${fieldPath}.activity`,
          "Expected a date inspiration drop activity",
          source,
        );
      } else if (source.activity === "mines_chest") {
        if ("locationId" in source) {
          malformed(
            diagnostics,
            targetId,
            `${fieldPath}.locationId`,
            "A Mines chest drop has no location",
            source,
          );
        }
      } else {
        stringReferences.push(["locationId", "location"]);
      }
      break;
    case "dive":
    case "fish":
      optionalReferenceArray(
        source,
        "waterTypes",
        "waterType",
        targetId,
        fieldPath,
        references,
        diagnostics,
      );
      break;
    case "donate_item":
    case "ship_item":
      validateTriggeredItem(source, targetId, fieldPath, references, diagnostics);
      break;
    case "equipment":
      stringReferences.push(["itemId", "item"]);
      break;
    case "festival":
      stringReferences.push(["festivalId", "festival"]);
      optionalReference(source, "storeId", "store", targetId, fieldPath, references, diagnostics);
      break;
    case "festival_activity":
      stringReferences.push(["activityId", "activity"], ["festivalId", "festival"]);
      break;
    case "mine":
      stringReferences.push(["biomeId", "biome"]);
      break;
    case "mine_fish":
      optionalReference(source, "biomeId", "biome", targetId, fieldPath, references, diagnostics);
      break;
    case "mines_chest":
      stringReferences.push(["biomeId", "biome"]);
      optionalReference(
        source,
        "lootGroup",
        "dungeonLootGroup",
        targetId,
        fieldPath,
        references,
        diagnostics,
      );
      optionalReference(source, "perkId", "perk", targetId, fieldPath, references, diagnostics);
      break;
    case "mines_dig_site":
      stringReferences.push(["biomeId", "biome"], ["perkId", "perk"]);
      break;
    case "monster":
    case "monster_feed":
      stringReferences.push(["monsterId", "monster"]);
      break;
    case "museum_donation":
      requiredNumbers.push("setCount");
      stringReferences.push(["wingId", "wing"]);
      break;
    case "perk":
    case "ritual_chamber":
      stringReferences.push(["perkId", "perk"]);
      break;
    case "perk_drop":
      stringReferences.push(["perkId", "perk"]);
      if (source.activity !== "crop_harvest") {
        malformed(
          diagnostics,
          targetId,
          `${fieldPath}.activity`,
          'Expected "crop_harvest"',
          source,
        );
      }
      break;
    case "proposal":
      stringReferences.push(["villagerId", "villager"]);
      break;
    case "quest":
      stringReferences.push(["questId", "quest"]);
      optionalReference(
        source,
        "challengeRecipeId",
        "recipe",
        targetId,
        fieldPath,
        references,
        diagnostics,
      );
      optionalReference(
        source,
        "choiceId",
        "dialogueChoice",
        targetId,
        fieldPath,
        references,
        diagnostics,
      );
      optionalReference(
        source,
        "requestedItemId",
        "item",
        targetId,
        fieldPath,
        references,
        diagnostics,
      );
      optionalReference(
        source,
        "questType",
        "questType",
        targetId,
        fieldPath,
        references,
        diagnostics,
      );
      if (source.trigger !== "completion" && source.trigger !== "dialogue_choice") {
        malformed(
          diagnostics,
          targetId,
          `${fieldPath}.trigger`,
          "Expected a quest trigger",
          source,
        );
      }
      break;
    case "reach_day":
      validateReachedDay(source, targetId, fieldPath, diagnostics);
      break;
    case "letter":
      stringReferences.push(["letterId", "letter"]);
      if (source.trigger !== "birthday" && source.trigger !== "condition") {
        malformed(
          diagnostics,
          targetId,
          `${fieldPath}.trigger`,
          "Expected a letter trigger",
          source,
        );
      }
      break;
    case "recipe":
      stringReferences.push(["recipeId", "recipe"]);
      if (
        !new Set(["cook", "craft", "dragon_forge", "mill", "smith"]).has(source.method as string)
      ) {
        malformed(
          diagnostics,
          targetId,
          `${fieldPath}.method`,
          "Expected a production method",
          source,
        );
      }
      break;
    case "renown":
      requiredNumbers.push("level");
      break;
    case "scroll_bundle":
      stringReferences.push(["bundleItemId", "item"], ["storeId", "store"]);
      break;
    case "spouseGift":
      stringReferences.push(["villagerId", "villager"]);
      break;
    case "station":
      stringReferences.push(["stationId", "station"]);
      break;
    case "secret_chest":
      stringReferences.push(["locationId", "location"]);
      break;
    case "store":
      stringReferences.push(["storeId", "store"]);
      break;
    case "treasure_chest":
      stringReferences.push(["tier", "treasureChestTier"]);
      break;
    case "tree":
      stringReferences.push(["saplingItemId", "item"]);
      break;
    case "upgrade":
      stringReferences.push(["storeId", "store"]);
      if (!(UPGRADE_IDS as readonly unknown[]).includes(source.upgradeId)) {
        malformed(
          diagnostics,
          targetId,
          `${fieldPath}.upgradeId`,
          "Expected an upgrade id",
          source,
        );
      }
      break;
    case "horse_statue":
      requiredNumbers.push("cost");
      stringReferences.push(["questId", "quest"]);
      break;
    case "wishing_well":
      break;
  }

  for (const [field, kind] of stringReferences) {
    if (requireString(source, field, targetId, fieldPath, source, diagnostics)) {
      reference(
        diagnostics,
        references,
        kind,
        source[field],
        targetId,
        `${fieldPath}.${field}`,
        source,
      );
    }
  }
  for (const field of requiredNumbers) {
    requireNumber(source, field, targetId, fieldPath, source, diagnostics);
  }
  for (const field of requiredStrings) {
    requireString(source, field, targetId, fieldPath, source, diagnostics);
  }
}

function requireRecord(
  value: unknown,
  targetId: string,
  fieldPath: string,
  diagnostics: AcquisitionSourceDiagnostic[],
): Record<string, unknown> | undefined {
  if (isRecord(value)) return value;
  malformed(diagnostics, targetId, fieldPath, "Expected an object", undefined);
  return undefined;
}

function sortedEntries(record: Record<string, unknown>): [string, unknown][] {
  return Object.entries(record).toSorted(([left], [right]) => compareStrings(left, right));
}

/** Checks a required array of ID strings and resolves each one; non-strings are malformed. */
function validateIdArray(
  value: unknown,
  kind: AcquisitionReferenceKind,
  targetId: string,
  fieldPath: string,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
  { nonEmpty }: { nonEmpty: boolean },
): void {
  const entries = getDenseJsonArrayValues(value);
  if (!entries) {
    malformed(diagnostics, targetId, fieldPath, "Expected an array of IDs", undefined);
    return;
  }
  if (nonEmpty && entries.length === 0) {
    malformed(diagnostics, targetId, fieldPath, "Expected at least one ID", undefined);
  }
  for (const [index, id] of entries.entries()) {
    reference(diagnostics, references, kind, id, targetId, `${fieldPath}[${index}]`);
  }
}

function validateAlmanac(
  almanac: unknown,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  const categories = requireRecord(almanac, "almanac", "almanac", diagnostics);
  if (!categories) return;
  for (const [categoryId, category] of sortedEntries(categories)) {
    const categoryPath = `almanac.${categoryId}`;
    const categoryRecord = requireRecord(category, categoryId, categoryPath, diagnostics);
    if (!categoryRecord) continue;
    const entries = getDenseJsonArrayValues(categoryRecord.items);
    if (!entries) {
      malformed(
        diagnostics,
        categoryId,
        `${categoryPath}.items`,
        "Expected an array of almanac entries",
        undefined,
      );
      continue;
    }
    for (const [index, entry] of entries.entries()) {
      const entryPath = `${categoryPath}.items[${index}]`;
      const entryRecord = requireRecord(entry, categoryId, entryPath, diagnostics);
      if (!entryRecord) continue;
      validateIdArray(
        entryRecord.itemIds,
        "item",
        categoryId,
        `${entryPath}.itemIds`,
        references,
        diagnostics,
        { nonEmpty: true },
      );
      if ("recipeId" in entryRecord) {
        reference(
          diagnostics,
          references,
          "recipe",
          entryRecord.recipeId,
          categoryId,
          `${entryPath}.recipeId`,
        );
      }
    }
  }
}

function validateAnimals(
  animals: unknown,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  const record = requireRecord(animals, "animals", "animals", diagnostics);
  if (!record) return;
  for (const [animalId, animal] of sortedEntries(record)) {
    const animalPath = `animals.${animalId}`;
    reference(diagnostics, references, "animal", animalId, animalId, animalPath);
    const animalRecord = requireRecord(animal, animalId, animalPath, diagnostics);
    if (!animalRecord) continue;
    validateEntityVisibility(animalRecord, animalId, animalPath, references, diagnostics);
    validateEntities(`${animalPath}.cosmetics`, animalRecord.cosmetics, references, diagnostics);
  }
}

function validateCategoryVisibility(
  categoryVisibility: unknown,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  const record = requireRecord(
    categoryVisibility,
    "categoryVisibility",
    "categoryVisibility",
    diagnostics,
  );
  if (!record) return;
  for (const [category, visibility] of sortedEntries(record)) {
    validateVisibility(
      visibility,
      category,
      `categoryVisibility.${category}`,
      undefined,
      references,
      diagnostics,
      new Set(),
    );
  }
}

function validateEntityVisibility(
  entity: Record<string, unknown>,
  targetId: string,
  entityPath: string,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  if (!("visibility" in entity)) return;
  validateVisibility(
    entity.visibility,
    targetId,
    `${entityPath}.visibility`,
    undefined,
    references,
    diagnostics,
    new Set(),
  );
}

function validateMuseum(
  museum: unknown,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  const wings = requireRecord(museum, "museum", "museum", diagnostics);
  if (!wings) return;
  for (const [wingId, wing] of sortedEntries(wings)) {
    const wingRecord = requireRecord(wing, wingId, `museum.${wingId}`, diagnostics);
    if (!wingRecord) continue;
    const sets = requireRecord(wingRecord.sets, wingId, `museum.${wingId}.sets`, diagnostics);
    if (!sets) continue;
    for (const [setId, set] of sortedEntries(sets)) {
      const setPath = `museum.${wingId}.sets.${setId}`;
      const setRecord = requireRecord(set, setId, setPath, diagnostics);
      if (!setRecord) continue;
      validateIdArray(setRecord.items, "item", setId, `${setPath}.items`, references, diagnostics, {
        nonEmpty: true,
      });
    }
  }
}

function validateMount(
  mount: unknown,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  const record = requireRecord(mount, "mount", "mount", diagnostics);
  if (!record) return;
  validateEntities("mount.appearances", record.appearances, references, diagnostics);
}

function validatePets(
  pets: unknown,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  const record = requireRecord(pets, "pets", "pets", diagnostics);
  if (!record) return;
  validateEntities("pets.cosmetics", record.cosmetics, references, diagnostics);
  validateEntities("pets.skins", record.skins, references, diagnostics);
}

function validateQuestFields(
  quest: Record<string, unknown>,
  rules: readonly QuestFieldRule[],
  questId: string,
  questPath: string,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  for (const rule of rules) {
    const fieldPath = `${questPath}.${rule.field}`;
    if (!(rule.field in quest)) {
      if (rule.required) malformed(diagnostics, questId, fieldPath, "Expected a value", undefined);
      continue;
    }
    const value = quest[rule.field];
    switch (rule.type) {
      case "heartLevelChanges": {
        const changes = getDenseJsonArrayValues(value);
        if (!changes) {
          malformed(diagnostics, questId, fieldPath, "Expected an array of changes", undefined);
          break;
        }
        for (const [index, change] of changes.entries()) {
          const changePath = `${fieldPath}[${index}]`;
          const changeRecord = requireRecord(change, questId, changePath, diagnostics);
          if (!changeRecord) continue;
          requireNumber(changeRecord, "level", questId, changePath, undefined, diagnostics);
          reference(
            diagnostics,
            references,
            "villager",
            changeRecord.villagerId,
            questId,
            `${changePath}.villagerId`,
          );
        }
        break;
      }
      case "number":
        requireNumber(quest, rule.field, questId, questPath, undefined, diagnostics);
        break;
      case "reference":
        reference(diagnostics, references, rule.kind, value, questId, fieldPath);
        break;
    }
  }
}

function validateQuests(
  quests: unknown,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  const groups = requireRecord(quests, "quests", "quests", diagnostics);
  if (!groups) return;
  for (const [questType, group] of sortedEntries(groups)) {
    const groupPath = `quests.${questType}`;
    if (!Object.hasOwn(QUEST_FIELDS, questType)) {
      malformed(diagnostics, questType, groupPath, "Expected a known quest type", undefined);
      continue;
    }
    validateEntities(groupPath, group, references, diagnostics, { selfKind: "quest" });
    const questRecords = isRecord(group) ? group : {};
    for (const [questId, quest] of sortedEntries(questRecords)) {
      if (!isRecord(quest)) continue;
      validateQuestFields(
        quest,
        QUEST_FIELDS[questType as QuestType],
        questId,
        `${groupPath}.${questId}`,
        references,
        diagnostics,
      );
    }
  }
}

function validateSpells(
  mines: unknown,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  const record = requireRecord(mines, "mines", "mines", diagnostics);
  if (!record) return;
  validateEntities("mines.spells", record.spells, references, diagnostics);
}

function validateVisibility(
  value: unknown,
  targetId: string,
  fieldPath: string,
  source: object | undefined,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
  active: Set<object>,
): void {
  if (!isRecord(value)) {
    malformed(diagnostics, targetId, fieldPath, "Expected a visibility condition object", source);
    return;
  }
  if (active.has(value)) {
    malformed(diagnostics, targetId, fieldPath, "Expected an acyclic visibility tree", source);
    return;
  }
  if (!validateAvailabilityPropertyShape(value, targetId, fieldPath, source, diagnostics)) return;
  const type = value.type;
  if (typeof type !== "string" || !Object.hasOwn(VISIBILITY_FIELDS, type)) {
    malformed(
      diagnostics,
      targetId,
      `${fieldPath}.type`,
      "Expected a known visibility type",
      source,
    );
    return;
  }
  const visibilityType = type as VisibilityCondition["type"];
  const allowedFields = new Set<string>(["type", ...VISIBILITY_FIELDS[visibilityType]]);
  for (const key of Object.getOwnPropertyNames(value)) {
    if (!allowedFields.has(key)) {
      malformed(
        diagnostics,
        targetId,
        `${fieldPath}.${key}`,
        `Unexpected field for ${type} visibility`,
        source,
      );
    }
  }

  const visibilityReference = (field: string, kind: AcquisitionReferenceKind): void => {
    if (requireString(value, field, targetId, fieldPath, source, diagnostics)) {
      reference(
        diagnostics,
        references,
        kind,
        value[field],
        targetId,
        `${fieldPath}.${field}`,
        source,
      );
    }
  };

  active.add(value);
  try {
    switch (visibilityType) {
      case "always":
      case "hasUpperFloor":
      case "isDating":
        return;
      case "and":
      case "or": {
        const conditions = getDenseJsonArrayValues(value.conditions);
        if (!conditions || conditions.length === 0) {
          malformed(
            diagnostics,
            targetId,
            `${fieldPath}.conditions`,
            "Expected a non-empty array of visibility conditions",
            source,
          );
          return;
        }
        for (const [index, condition] of conditions.entries()) {
          validateVisibility(
            condition,
            targetId,
            `${fieldPath}.conditions[${index}]`,
            source,
            references,
            diagnostics,
            active,
          );
        }
        return;
      }
      case "heartLevel":
        requireNumber(value, "level", targetId, fieldPath, source, diagnostics);
        visibilityReference("villagerId", "villager");
        return;
      case "married":
      case "villagerKnown":
        visibilityReference("villagerId", "villager");
        return;
      case "mineFloor":
        requireNumber(value, "floor", targetId, fieldPath, source, diagnostics);
        return;
      case "perkUnlocked":
        visibilityReference("perkId", "perk");
        return;
      case "questAvailable":
      case "questCompleted":
        visibilityReference("questId", "quest");
        return;
      case "reachedSeason":
        if (
          requireString(value, "season", targetId, fieldPath, source, diagnostics) &&
          !SEASON_VALUES.has(value.season as string)
        ) {
          malformed(
            diagnostics,
            targetId,
            `${fieldPath}.season`,
            `Unknown season "${value.season as string}"`,
            source,
          );
        }
        return;
      case "renownLevel":
        requireNumber(value, "level", targetId, fieldPath, source, diagnostics);
        return;
      case "skillLevel":
        requireNumber(value, "level", targetId, fieldPath, source, diagnostics);
        visibilityReference("skillId", "skill");
    }
  } finally {
    active.delete(value);
  }
}

/** Validates the `visibility` of entities that carry no acquisition sources. */
function validateVisibilityOnly(
  collectionPath: string,
  entities: unknown,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  const record = requireRecord(entities, collectionPath, collectionPath, diagnostics);
  if (!record) return;
  for (const [entityId, entity] of sortedEntries(record)) {
    const entityPath = `${collectionPath}.${entityId}`;
    const entityRecord = requireRecord(entity, entityId, entityPath, diagnostics);
    if (entityRecord) {
      validateEntityVisibility(entityRecord, entityId, entityPath, references, diagnostics);
    }
  }
}
