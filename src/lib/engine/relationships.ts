import { trackerData } from "$lib/data/index.js";

import type { VillagerId, VillagerRelationship } from "$lib/types/tracker-data.js";

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
  marriedVillager: null | VillagerId;
  relationship: VillagerRelationship;
  villagerId: VillagerId;
}

export function getMarriedVillager(
  villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>>,
): null | VillagerId {
  for (const [villagerId, rel] of Object.entries(villagerRelationships)) {
    if (rel === "married") return villagerId as VillagerId;
  }
  return null;
}

export function isRomantic(
  villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>>,
  villagerId: VillagerId,
): boolean {
  const rel = villagerRelationships[villagerId];
  return rel === "romantic" || rel === "proposed" || rel === "married";
}

export function normalizeRelationships(
  villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>>,
): void {
  const marriedVillager = getMarriedVillager(villagerRelationships);
  if (!marriedVillager) return;

  for (const [villagerId, rel] of Object.entries(villagerRelationships)) {
    if (villagerId !== marriedVillager && rel !== "platonic") {
      villagerRelationships[villagerId as VillagerId] = "platonic";
    }
  }

  const dateableVillagers = Object.entries(trackerData.villagers)
    .filter(([, villager]) => villager.dateable)
    .map(([id]) => id as VillagerId);
  for (const villagerId of dateableVillagers) {
    if (villagerId !== marriedVillager && !(villagerId in villagerRelationships)) {
      villagerRelationships[villagerId] = "platonic";
    }
  }
}

/**
 * Which branch of the relationship tree `rel` belongs to: `undecided` splits into a `platonic`
 * branch and a `romantic` branch (romantic → proposed → married). Used to tell a lateral move
 * (a household merge conflict) from a forward move up a branch (silent).
 */
export function relationshipBranch(
  rel: VillagerRelationship,
): "platonic" | "romantic" | "undecided" {
  if (rel === "platonic") return "platonic";
  if (rel === "undecided") return "undecided";
  return "romantic";
}

export function relationshipPresentation({
  childChoice,
  level,
  marriedVillager,
  relationship,
  villagerId,
}: RelationshipPresentationInput): RelationshipPresentation {
  if (marriedVillager !== null && marriedVillager !== villagerId) {
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

/** Progress within a relationship branch; only meaningful when comparing two values on the same branch. */
export function relationshipRank(rel: VillagerRelationship): number {
  switch (rel) {
    case "married":
      return 3;
    case "platonic":
    case "romantic":
      return 1;
    case "proposed":
      return 2;
    case "undecided":
      return 0;
  }
}
