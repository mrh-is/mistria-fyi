import type { NpcId, PerkId, QuestId, SkillId } from "./tracker-data.js";

export type QuestVisibility = "available" | "completed" | "unavailable";

export type VisibilityCondition =
  | { conditions: [VisibilityCondition, ...VisibilityCondition[]]; type: "and" }
  | { conditions: [VisibilityCondition, ...VisibilityCondition[]]; type: "or" }
  | { floor: number; type: "minesLevel" }
  | { level: number; npcId: NpcId; type: "heartLevel" }
  | { level: number; skillId: SkillId; type: "skillLevel" }
  | { level: number; type: "renownLevel" }
  | { npcId: NpcId; type: "married" }
  | { npcId: NpcId; type: "npcKnown" }
  | { perkId: PerkId; type: "perkUnlocked" }
  | { questId: QuestId; type: "questAvailable" }
  | { questId: QuestId; type: "questCompleted" }
  | { type: "always" };
