import { getSourceProvenance } from "./source-accumulator.js";

import type { AvailabilityCondition, Source } from "$lib/types/acquisition.js";

import type { AcquisitionReferenceKind } from "./reference-index.js";
import type { AcquisitionReferenceIndex } from "./reference-index.js";

export interface AcquisitionSourceAssembly {
  almanac?: Readonly<Record<string, { items?: readonly string[] }>>;
  cosmetics: Readonly<Record<string, AcquisitionSourceEntity>>;
  items: Readonly<Record<string, AcquisitionSourceEntity>>;
  museum?: Readonly<
    Record<string, { sets?: Readonly<Record<string, { items?: readonly string[] }>> }>
  >;
  quests?: Readonly<
    Partial<Record<string, Readonly<Record<string, { itemId?: string; npc?: string }>>>>
  >;
  recipes: Readonly<Record<string, AcquisitionRecipeEntity>>;
}

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

interface AcquisitionRecipeEntity extends AcquisitionSourceEntity {
  memberItemIds?: readonly string[];
  presentations?: readonly { itemIds?: readonly string[] }[];
}

interface AcquisitionSourceEntity {
  sources: readonly unknown[];
}

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
  gamePredicate: ["predicate", "value"],
  heartLevel: ["level", "npcId"],
  minesLevel: ["floor"],
  not: ["condition"],
  perkUnlocked: ["perkId"],
  quest: ["questId", "state"],
  season: ["seasons"],
  skillLevel: ["level", "skillId"],
  time: ["end", "start"],
  weather: ["weathers"],
} as const satisfies Record<AvailabilityCondition["type"], readonly string[]>;

const SEASONS = new Set(["fall", "spring", "summer", "winter"]);
const WEATHERS = new Set(["calm", "heavy_inclement", "inclement", "special"]);

const SOURCE_FIELDS = {
  animal_product: ["animalId"],
  artifact_dig: ["locationIds"],
  artifact_replicator: ["originalItemId"],
  bait_fish: ["baitItemIds"],
  beach_cave_chest: [],
  breed: [],
  bug_catch: ["locationIds"],
  chicken_statue: ["cost"],
  crop: ["seedItemId"],
  date: ["dateId"],
  date_inspiration: ["itemId"],
  default: [],
  dive: ["waterTypes"],
  engagement: [],
  equipment: ["itemId"],
  festival: ["festivalId", "storeId"],
  festival_activity: ["activityId", "festivalId"],
  fish: ["waterTypes"],
  fish_trap: ["baitItemIds"],
  forage: ["locationIds"],
  letter: ["trigger", "triggerDate", "triggerItemId"],
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
  proposal: ["npcId"],
  quest: ["challengeRecipeId", "choiceId", "questId", "questType", "requestedItemId", "trigger"],
  recipe: ["method", "recipeId"],
  renown: ["level"],
  ritual_chamber: ["perkId"],
  scroll_bundle: ["bundleName", "storeId"],
  station: ["stationId"],
  store: ["storeId"],
  treasure_chest: ["tier"],
  tree: ["saplingItemId"],
  upgrade: ["storeId", "upgradeName"],
  wedding: [],
  wishing_well: ["cost"],
} as const satisfies Record<Source["type"], readonly string[]>;

const SOURCE_TYPES = new Set<string>(Object.keys(SOURCE_FIELDS));
const SOURCE_DETAIL_FIELDS = ["availability", "cost", "visibility", "weight"];

export class AcquisitionSourceValidationError extends Error {
  constructor(readonly diagnostics: AcquisitionSourceDiagnostic[]) {
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
    this.name = "AcquisitionSourceValidationError";
  }
}

export function validateAcquisitionSources(
  trackerData: AcquisitionSourceAssembly,
  references: AcquisitionReferenceIndex,
): void {
  const diagnostics: AcquisitionSourceDiagnostic[] = [];

  validateEntities("cosmetic", trackerData.cosmetics, references, diagnostics);
  validateEntities("item", trackerData.items, references, diagnostics);
  validateEntities("recipe", trackerData.recipes, references, diagnostics);
  validateAssemblyReferences(trackerData, references, diagnostics);
  validateRecipeCycles(trackerData.recipes, diagnostics);

  diagnostics.sort(compareDiagnostics);
  if (diagnostics.length > 0) throw new AcquisitionSourceValidationError(diagnostics);
}

function compareDiagnostics(
  left: AcquisitionSourceDiagnostic,
  right: AcquisitionSourceDiagnostic,
): number {
  return (
    DIAGNOSTIC_ORDER[left.kind] - DIAGNOSTIC_ORDER[right.kind] ||
    left.targetId.localeCompare(right.targetId) ||
    left.fieldPath.localeCompare(right.fieldPath) ||
    left.message.localeCompare(right.message) ||
    (left.sourcePath ?? "").localeCompare(right.sourcePath ?? "")
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
  const values = new Array<unknown>(value.length);
  for (let index = 0; index < value.length; index++) {
    const descriptor = descriptors[index];
    if (!descriptor?.enumerable || !("value" in descriptor)) return undefined;
    values[index] = descriptor.value;
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
  const prototype = Object.getPrototypeOf(value);
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
    (source[field] as string[]).forEach((id, index) => {
      reference(
        diagnostics,
        references,
        kind,
        id,
        targetId,
        `${fieldPath}.${field}[${index}]`,
        source,
      );
    });
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
  if (typeof id !== "string") return;
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
  return kind.replace(/[A-Z]/g, (character) => ` ${character.toLowerCase()}`);
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
    (source[field] as string[]).forEach((id, index) => {
      reference(
        diagnostics,
        references,
        kind,
        id,
        targetId,
        `${fieldPath}.${field}[${index}]`,
        source,
      );
    });
  }
}

function requireNumber(
  value: Record<string, unknown>,
  field: string,
  targetId: string,
  fieldPath: string,
  source: object,
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
  source: object,
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
  source: object,
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

function validateAssemblyReferences(
  trackerData: AcquisitionSourceAssembly,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  for (const [categoryId, category] of Object.entries(trackerData.almanac ?? {})) {
    for (const itemId of [...(category.items ?? [])].sort()) {
      reference(
        diagnostics,
        references,
        "item",
        itemId,
        itemId,
        `almanac.${categoryId}.items[${itemId}]`,
      );
    }
  }
  for (const [wingId, wing] of Object.entries(trackerData.museum ?? {})) {
    for (const [setId, set] of Object.entries(wing.sets ?? {})) {
      for (const [itemIndex, itemId] of (set.items ?? []).entries()) {
        reference(
          diagnostics,
          references,
          "item",
          itemId,
          itemId,
          `museum.${wingId}.sets.${setId}.items[${itemIndex}]`,
        );
      }
    }
  }
  for (const [recipeId, recipe] of Object.entries(trackerData.recipes).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    recipe.memberItemIds?.forEach((itemId, index) => {
      reference(
        diagnostics,
        references,
        "item",
        itemId,
        recipeId,
        `recipes.${recipeId}.memberItemIds[${index}]`,
      );
    });
    recipe.presentations?.forEach((presentation, presentationIndex) =>
      presentation.itemIds?.forEach((itemId, itemIndex) => {
        reference(
          diagnostics,
          references,
          "item",
          itemId,
          recipeId,
          `recipes.${recipeId}.presentations[${presentationIndex}].itemIds[${itemIndex}]`,
        );
      }),
    );
  }
  for (const [questType, questGroup] of Object.entries(trackerData.quests ?? {}).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    for (const [questId, quest] of Object.entries(questGroup ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      if (quest.itemId) {
        reference(
          diagnostics,
          references,
          "item",
          quest.itemId,
          questId,
          `quests.${questType}.${questId}.itemId`,
        );
      }
      if (quest.npc) {
        reference(
          diagnostics,
          references,
          "npc",
          quest.npc,
          questId,
          `quests.${questType}.${questId}.npc`,
        );
      }
    }
  }
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
        if (!conditions) {
          malformed(
            diagnostics,
            targetId,
            `${fieldPath}.conditions`,
            "Expected a dense JSON array of availability conditions",
            source,
          );
        } else {
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
        }
        return;
      }
      case "always":
        return;
      case "gamePredicate":
        requireString(value, "predicate", targetId, fieldPath, source, diagnostics);
        if (!isJsonValue(value.value, new Set())) {
          malformed(diagnostics, targetId, `${fieldPath}.value`, "Expected a JSON value", source);
        }
        return;
      case "heartLevel":
        requireNumber(value, "level", targetId, fieldPath, source, diagnostics);
        if (requireString(value, "npcId", targetId, fieldPath, source, diagnostics)) {
          reference(
            diagnostics,
            references,
            "npc",
            value.npcId,
            targetId,
            `${fieldPath}.npcId`,
            source,
          );
        }
        return;
      case "minesLevel":
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
      case "season":
        {
          const seasons = requireStringArray(
            value,
            "seasons",
            targetId,
            fieldPath,
            source,
            diagnostics,
          );
          seasons?.forEach((season, index) => {
            if (!SEASONS.has(season)) {
              malformed(
                diagnostics,
                targetId,
                `${fieldPath}.seasons[${index}]`,
                `Unknown season "${season}"`,
                source,
              );
            }
          });
        }
        return;
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
      case "weather":
        {
          const weathers = requireStringArray(
            value,
            "weathers",
            targetId,
            fieldPath,
            source,
            diagnostics,
          );
          weathers?.forEach((weather, index) => {
            if (!WEATHERS.has(weather)) {
              malformed(
                diagnostics,
                targetId,
                `${fieldPath}.weathers[${index}]`,
                `Unknown weather "${weather}"`,
                source,
              );
            }
          });
        }
        return;
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
  source: object,
  diagnostics: AcquisitionSourceDiagnostic[],
): boolean {
  let valid = true;
  if (Object.getOwnPropertySymbols(value).length > 0) {
    malformed(
      diagnostics,
      targetId,
      fieldPath,
      "Expected an availability object without symbol properties",
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
  if ("visibility" in source && !isJsonValue(source.visibility, new Set())) {
    malformed(diagnostics, targetId, `${fieldPath}.visibility`, "Expected a JSON value", source);
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
  kind: "cosmetic" | "item" | "recipe",
  entities: Readonly<Record<string, AcquisitionSourceEntity>>,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  const label = `${kind[0].toUpperCase()}${kind.slice(1)}`;
  for (const [targetId, entity] of Object.entries(entities).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    reference(diagnostics, references, kind, targetId, targetId, `${kind}s.${targetId}`);
    const entitySources = entity.sources;
    if (!Array.isArray(entitySources)) {
      malformed(
        diagnostics,
        targetId,
        `${kind}s.${targetId}.sources`,
        "Expected an array of acquisition sources",
        undefined,
      );
      continue;
    }
    if (entitySources.length === 0) {
      diagnostics.push({
        fieldPath: `${kind}s.${targetId}.sources`,
        kind: "missing-source",
        message: `${label} "${targetId}" has no acquisition sources`,
        targetId,
      });
    }
    entitySources.forEach((source, index) => {
      validateSource(
        source,
        targetId,
        `${kind}s.${targetId}.sources[${index}]`,
        references,
        diagnostics,
      );
    });
  }
}

function validateLetter(
  source: Record<string, unknown>,
  targetId: string,
  fieldPath: string,
  references: AcquisitionReferenceIndex,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  switch (source.trigger) {
    case "donated_item":
    case "shipped_item":
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
      break;
    case "reached_date":
      if (!isRecord(source.triggerDate)) {
        malformed(
          diagnostics,
          targetId,
          `${fieldPath}.triggerDate`,
          "Expected a reached date",
          source,
        );
      } else {
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
      }
      break;
    default:
      malformed(diagnostics, targetId, `${fieldPath}.trigger`, "Expected a letter trigger", source);
  }
}

function validateRecipeCycles(
  recipes: Readonly<Record<string, AcquisitionRecipeEntity>>,
  diagnostics: AcquisitionSourceDiagnostic[],
): void {
  const graph = new Map<string, string[]>();
  for (const [recipeId, recipe] of Object.entries(recipes)) {
    const recipeSources = recipe.sources ?? [];
    const dependencies = (Array.isArray(recipeSources) ? recipeSources : [])
      .filter(isRecord)
      .filter((source) => source.type === "recipe" && typeof source.recipeId === "string")
      .map((source) => source.recipeId as string)
      .filter((dependency) => dependency in recipes)
      .sort((left, right) => left.localeCompare(right));
    graph.set(recipeId, dependencies);
  }

  const resolved = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];
  for (const recipeId of [...graph.keys()].sort((left, right) => left.localeCompare(right))) {
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
      break;
    case "crop":
      stringReferences.push(["seedItemId", "item"]);
      break;
    case "date":
      stringReferences.push(["dateId", "date"]);
      break;
    case "date_inspiration":
      stringReferences.push(["itemId", "item"]);
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
    case "letter":
      validateLetter(source, targetId, fieldPath, references, diagnostics);
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
      stringReferences.push(["npcId", "npc"]);
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
      requiredStrings.push("bundleName");
      stringReferences.push(["storeId", "store"]);
      break;
    case "station":
      stringReferences.push(["stationId", "station"]);
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
      requiredStrings.push("upgradeName");
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
