import type { NpcId, PerkId, QuestId, SkillId } from "./tracker-data.js";

export type QuestVisibility = "available" | "completed" | "unavailable";

export type VisibilityCondition =
  | { type: "always" }
  | { type: "and"; conditions: [VisibilityCondition, ...VisibilityCondition[]] }
  | { type: "heartLevel"; level: number; npcId: NpcId }
  | { type: "married"; npcId: NpcId }
  | { type: "minesLevel"; floor: number }
  | { type: "npcKnown"; npcId: NpcId }
  | { type: "or"; conditions: [VisibilityCondition, ...VisibilityCondition[]] }
  | { type: "perkUnlocked"; perkId: PerkId }
  | { type: "questAvailable"; questId: QuestId }
  | { type: "questCompleted"; questId: QuestId }
  | { type: "renownLevel"; level: number }
  | { type: "skillLevel"; level: number; skillId: SkillId };
