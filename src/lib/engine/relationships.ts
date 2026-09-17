import { trackerData } from "$lib/data/index.js";

import type { NpcId, NpcRelationship } from "$lib/types/tracker-data.js";

export type RelationshipActionValue =
  "married" | "no" | "platonic" | "proposed" | "romantic" | "yes";

export interface RelationshipPresentation {
  actions: RelationshipActionValue[];
  prompt?: RelationshipPrompt;
  status?: RelationshipStatus;
  warning?: boolean;
}

export type RelationshipPrompt = "choose_path" | "household" | "next_note";

export type RelationshipStatus =
  | "best_friends"
  | "dating"
  | "engaged"
  | "married"
  | "married_child_free"
  | "married_kids"
  | "path_not_chosen";

interface RelationshipPresentationInput {
  childChoice: "no" | "undeclared" | "yes";
  level: number;
  marriedNpc: NpcId | null;
  npcId: NpcId;
  relationship: NpcRelationship;
}

export function getMarriedNpc(
  npcRelationships: Partial<Record<NpcId, NpcRelationship>>,
): NpcId | null {
  for (const [npcId, rel] of Object.entries(npcRelationships)) {
    if (rel === "married") return npcId as NpcId;
  }
  return null;
}

export function isRomantic(
  npcRelationships: Partial<Record<NpcId, NpcRelationship>>,
  npcId: NpcId,
): boolean {
  const rel = npcRelationships[npcId];
  return rel === "romantic" || rel === "proposed" || rel === "married";
}

export function normalizeRelationships(
  npcRelationships: Partial<Record<NpcId, NpcRelationship>>,
): void {
  const marriedNpc = getMarriedNpc(npcRelationships);
  if (!marriedNpc) return;

  for (const [npcId, rel] of Object.entries(npcRelationships)) {
    if (npcId !== marriedNpc && rel !== "platonic") {
      npcRelationships[npcId as NpcId] = "platonic";
    }
  }

  const dateableNpcs = Object.entries(trackerData.npcs)
    .filter(([, npc]) => npc.dateable)
    .map(([id]) => id as NpcId);
  for (const npcId of dateableNpcs) {
    if (npcId !== marriedNpc && !(npcId in npcRelationships)) {
      npcRelationships[npcId] = "platonic";
    }
  }
}

export function relationshipPresentation({
  childChoice,
  level,
  marriedNpc,
  npcId,
  relationship,
}: RelationshipPresentationInput): RelationshipPresentation {
  if (marriedNpc !== null && marriedNpc !== npcId) {
    return { actions: [], status: "best_friends" };
  }

  if (relationship === "undecided") {
    if (level < 8) return { actions: [] };
    return {
      actions: ["platonic", "romantic"],
      prompt: "choose_path",
      status: "path_not_chosen",
    };
  }

  if (relationship === "platonic") return { actions: [], status: "best_friends" };

  if (relationship === "romantic") {
    return {
      actions: level >= 10 ? ["proposed"] : [],
      prompt: level >= 10 ? "next_note" : undefined,
      status: "dating",
    };
  }

  if (relationship === "proposed") {
    return {
      actions: ["married"],
      prompt: "next_note",
      status: "engaged",
      warning: true,
    };
  }

  if (childChoice === "undeclared") {
    return {
      actions: ["yes", "no"],
      prompt: "household",
      status: "married",
    };
  }

  return {
    actions: [],
    status: childChoice === "yes" ? "married_kids" : "married_child_free",
  };
}
