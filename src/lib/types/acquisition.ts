import type * as v from "valibot";

import type { AvailabilityLeafSchema, SourceSchema } from "./tracker-data-schema.js";
import type { SourcedEntity } from "./tracker-data.js";

export type ActivityId = string & v.Brand<"ActivityId">;
/** Recursive edges require an explicit annotation; the schema owns all leaf payloads. */
export type AvailabilityCondition =
  | v.InferOutput<typeof AvailabilityLeafSchema>
  | { type: "all"; conditions: [AvailabilityCondition, ...AvailabilityCondition[]] }
  | { type: "any"; conditions: [AvailabilityCondition, ...AvailabilityCondition[]] }
  | { type: "not"; condition: AvailabilityCondition };
/** Reviewed cutscenes with no native player-facing name. */
export const CUTSCENE_SOURCE_IDS = ["elsie_dating_tutorial", "great_bird_0"] as const;
export type CutsceneSourceId = (typeof CUTSCENE_SOURCE_IDS)[number];
export const DATE_INSPIRATION_DROP_ACTIVITIES = ["dig_site", "fish", "mines_chest"] as const;
export type JsonValue =
  | boolean
  | JsonValue[]
  | null
  | number
  | string
  | { [key: string]: JsonValue };
export type LocationId = string & v.Brand<"LocationId">;
export type MonsterId = string & v.Brand<"MonsterId">;
export type Source = v.InferOutput<typeof SourceSchema>;
export type SourceTuple = SourcedEntity["sources"];
export type ProductionMethod = Extract<Source, { type: "recipe" }>["method"];
export type StationId = string & v.Brand<"StationId">;
/** Purchasable home & farm upgrades; each id is also the upgraded item's id. */
export const UPGRADE_IDS = ["adept_kitchen", "cozy_kitchen", "farm_bridge", "stairs"] as const;
export type UpgradeId = (typeof UPGRADE_IDS)[number];
export type WaterType = string & v.Brand<"WaterType">;
