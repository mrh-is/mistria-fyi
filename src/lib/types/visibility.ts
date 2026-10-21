import type * as v from "valibot";

import type { NonEmptyArray } from "#lib/utils/record.js";

import type { VisibilityLeafSchema } from "./tracker-data-schema.js";

export type QuestVisibility = "available" | "completed" | "unavailable";

/** Only recursive edges are annotated; leaf payloads derive from the shared schema. */
export type VisibilityCondition =
  | v.InferOutput<typeof VisibilityLeafSchema>
  | { type: "and"; conditions: NonEmptyArray<VisibilityCondition> }
  | { type: "or"; conditions: NonEmptyArray<VisibilityCondition> };
