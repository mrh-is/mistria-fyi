import { trackerData } from "$lib/data/index.js";

import type { NpcId, NpcRelationship } from "$lib/types/tracker-data.js";

export interface RelationshipAction {
  label: string;
  value: RelationshipActionValue;
}

export type RelationshipActionValue =
  "married" | "no" | "platonic" | "proposed" | "romantic" | "yes";

export interface RelationshipPresentation {
  actions: RelationshipAction[];
  label?: string;
  prompt?: "Choose path" | "Household" | "Next note";
  warning?: string;
}

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
    return { actions: [], label: "Best friends" };
  }

  if (relationship === "undecided") {
    if (level < 8) return { actions: [] };
    return {
      actions: [
        { label: "Best friends", value: "platonic" },
        { label: "Start dating", value: "romantic" },
      ],
      label: "Path not chosen",
      prompt: "Choose path",
    };
  }

  if (relationship === "platonic") return { actions: [], label: "Best friends" };

  if (relationship === "romantic") {
    return {
      actions: level >= 10 ? [{ label: "Record proposal", value: "proposed" }] : [],
      label: "Dating",
      prompt: level >= 10 ? "Next note" : undefined,
    };
  }

  if (relationship === "proposed") {
    return {
      actions: [{ label: "Record marriage", value: "married" }],
      label: "Engaged",
      prompt: "Next note",
      warning: "Marriage closes every other romantic path.",
    };
  }

  if (childChoice === "undeclared") {
    return {
      actions: [
        { label: "Kids", value: "yes" },
        { label: "Child-free", value: "no" },
      ],
      label: "Married",
      prompt: "Household",
    };
  }

  return {
    actions: [],
    label: childChoice === "yes" ? "Married · kids" : "Married · child-free",
  };
}
