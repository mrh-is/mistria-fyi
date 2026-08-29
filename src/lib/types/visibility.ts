import type { NpcId, PerkId, QuestId, Season, SkillId } from "./tracker-data.js";

export type QuestVisibility = "available" | "completed" | "unavailable";

export type VisibilityCondition =
  | { type: "always" }
  | { type: "and"; conditions: [VisibilityCondition, ...VisibilityCondition[]] }
  | { type: "hasUpperFloor" }
  | { type: "heartLevel"; level: number; npcId: NpcId }
  | { type: "isDating" }
  | { type: "married"; npcId: NpcId }
  | { type: "minesLevel"; floor: number }
  | { type: "npcKnown"; npcId: NpcId }
  | { type: "or"; conditions: [VisibilityCondition, ...VisibilityCondition[]] }
  | { type: "perkUnlocked"; perkId: PerkId }
  | { type: "questAvailable"; questId: QuestId }
  | { type: "questCompleted"; questId: QuestId }
  | { type: "reachedSeason"; season: Season }
  | { type: "renownLevel"; level: number }
  | { type: "skillLevel"; level: number; skillId: SkillId };
