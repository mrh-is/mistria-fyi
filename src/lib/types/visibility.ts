import type { PerkId, QuestId, Season, SkillId, VillagerId } from "./tracker-data.js";

export type QuestVisibility = "available" | "completed" | "unavailable";

export type VisibilityCondition =
  | { type: "always" }
  | { type: "and"; conditions: [VisibilityCondition, ...VisibilityCondition[]] }
  | { type: "hasUpperFloor" }
  | { type: "heartLevel"; level: number; villagerId: VillagerId }
  | { type: "isDating" }
  | { type: "married"; villagerId: VillagerId }
  | { type: "minesLevel"; floor: number }
  | { type: "or"; conditions: [VisibilityCondition, ...VisibilityCondition[]] }
  | { type: "perkUnlocked"; perkId: PerkId }
  | { type: "questAvailable"; questId: QuestId }
  | { type: "questCompleted"; questId: QuestId }
  | { type: "reachedSeason"; season: Season }
  | { type: "renownLevel"; level: number }
  | { type: "skillLevel"; level: number; skillId: SkillId }
  | { type: "villagerKnown"; villagerId: VillagerId };
