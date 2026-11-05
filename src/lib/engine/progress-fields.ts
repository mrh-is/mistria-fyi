import { SEASONS, VILLAGER_RELATIONSHIPS } from "#lib/types/tracker-data.js";
import { CHILD_CHOICES, QUEST_STATES } from "#lib/types/user-progress.js";
import { recordKeys } from "#lib/utils/record.js";

import { questStateRank, seasonOrdinal } from "./domain-primitives.js";
import {
  clampLevel,
  clampMineFloor,
  clampRenownLevel,
  MAX_HEART_LEVEL,
  MAX_SKILL_LEVEL,
} from "./progress.js";
import { relationshipRank } from "./relationships.js";

import type { Season, VillagerRelationship } from "#lib/types/tracker-data.js";
import type { MergeCounts, ProgressState, QuestState } from "#lib/types/user-progress.js";

export type ProgressField = keyof ProgressState;

export type FactKind = "level" | "quest" | "tick";

interface ChoiceSpec {
  choices: readonly string[];
  default: string;
  factKind: FactKind;
  rank?: (value: string) => number;
}

export type FieldSpec = (
  | (ChoiceSpec & { removeDefault?: true; shape: "choices" })
  | (ChoiceSpec & { shape: "choice" })
  | { clamp: (value: number) => number; shape: "level" | "levels" }
  | { required?: true; shape: "list" }
  | { shape: "animal-lists" | "flag" }
) & {
  /** Feedback may expose this field. A new field needs an explicit privacy decision. */
  feedback: boolean;
  /** Merge this as part of the household, which has its own rules. */
  household?: true;
  mergeCount?: keyof MergeCounts;
};

type FieldShape<Value> =
  Value extends ReadonlySet<unknown>
    ? "list"
    : Value extends boolean
      ? "flag"
      : Value extends number
        ? "level"
        : Value extends string
          ? "choice"
          : NonNullable<Value[keyof Value]> extends ReadonlySet<unknown>
            ? "animal-lists"
            : NonNullable<Value[keyof Value]> extends number
              ? "levels"
              : "choices";

type ProgressFieldSpecs = Record<keyof ProgressState, FieldSpec> & {
  [Field in ProgressField]: (Field extends keyof MergeCounts
    ? unknown
    : { mergeCount: keyof MergeCounts }) & {
    shape: FieldShape<ProgressState[Field]>;
  };
};

/** Shape, defaults, & policy metadata for every field that can become a progress fact. */
export const PROGRESS_FIELD_SPECS = {
  almanac: { feedback: true, required: true, shape: "list" },
  almanacRecipes: { feedback: true, shape: "list" },
  animalCosmetics: { feedback: true, shape: "animal-lists" },
  animals: { feedback: true, shape: "animal-lists" },
  breakUpsDisabled: { feedback: true, household: true, shape: "flag" },
  childChoice: {
    choices: CHILD_CHOICES,
    default: "undeclared",
    factKind: "tick",
    feedback: true,
    household: true,
    shape: "choice",
  },
  cosmetics: { feedback: true, required: true, shape: "list" },
  hasUpperFloor: { feedback: true, shape: "flag" },
  heartLevels: {
    clamp: (value) => clampLevel(value, MAX_HEART_LEVEL),
    feedback: true,
    shape: "levels",
  },
  mineFloor: { clamp: clampMineFloor, feedback: true, shape: "level" },
  mountAppearances: { feedback: true, shape: "list" },
  museum: { feedback: true, required: true, shape: "list" },
  petCosmetics: { feedback: true, shape: "list" },
  petSkins: { feedback: true, shape: "list" },
  questStates: {
    choices: QUEST_STATES,
    default: "none",
    factKind: "quest",
    feedback: true,
    mergeCount: "quests",
    rank: (value) => questStateRank(value as QuestState),
    shape: "choices",
  },
  reachedSeason: {
    choices: SEASONS,
    default: "spring",
    factKind: "level",
    feedback: true,
    rank: (value) => seasonOrdinal(value as Season),
    shape: "choice",
  },
  renown: { clamp: clampRenownLevel, feedback: true, shape: "level" },
  skillLevels: {
    clamp: (value) => clampLevel(value, MAX_SKILL_LEVEL),
    feedback: true,
    shape: "levels",
  },
  spells: { feedback: true, required: true, shape: "list" },
  unlockedPerks: { feedback: true, mergeCount: "perks", shape: "list" },
  villagerRelationships: {
    choices: VILLAGER_RELATIONSHIPS,
    default: "undecided",
    factKind: "tick",
    feedback: true,
    household: true,
    rank: (value) => relationshipRank(value as VillagerRelationship),
    removeDefault: true,
    shape: "choices",
  },
} as const satisfies ProgressFieldSpecs;

export const PROGRESS_FIELDS = recordKeys(PROGRESS_FIELD_SPECS);

type FieldsOfShape<Shape extends FieldSpec["shape"]> = {
  [Field in ProgressField]: (typeof PROGRESS_FIELD_SPECS)[Field]["shape"] extends Shape
    ? Field
    : never;
}[ProgressField];

export type ProgressListField = FieldsOfShape<"list">;
export const PROGRESS_LIST_FIELDS = PROGRESS_FIELDS.filter(
  (field): field is ProgressListField => PROGRESS_FIELD_SPECS[field].shape === "list",
);

export const FEEDBACK_PROGRESS_FIELDS = PROGRESS_FIELDS.filter(
  (field) => (PROGRESS_FIELD_SPECS[field] as FieldSpec).feedback,
);

export function fieldFactKind(spec: FieldSpec): FactKind {
  if (spec.shape === "level" || spec.shape === "levels") return "level";
  return "factKind" in spec ? spec.factKind : "tick";
}

function fieldDefault(
  spec: FieldSpec,
  SetType: new () => Set<string>,
  animalIds: readonly string[],
): boolean | number | object | string {
  switch (spec.shape) {
    case "animal-lists":
      return Object.fromEntries(animalIds.map((id) => [id, new SetType()]));
    case "choice":
      return spec.default;
    case "choices":
    case "levels":
      return {};
    case "flag":
      return false;
    case "level":
      return 0;
    case "list":
      return new SetType();
  }
}

/** A fresh set of defaults. The store supplies reactive sets & the animals it displays. */
export function createDefaultProgress(
  SetType: new () => Set<string> = Set,
  animalIds: readonly string[] = [],
): ProgressState {
  return Object.fromEntries(
    PROGRESS_FIELDS.map((field) => [
      field,
      fieldDefault(PROGRESS_FIELD_SPECS[field], SetType, animalIds),
    ]),
  ) as unknown as ProgressState;
}
