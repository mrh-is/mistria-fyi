import { trackerData } from "#lib/data/index.js";

import type { VillagerId, VillagerRelationship } from "#lib/types/tracker-data.js";
import type { ChildChoice, MergeConflict } from "#lib/types/user-progress.js";

/** The relationship facts a save merge treats as one unit: who the player is with, and kids. */
export interface Household {
  childChoice: ChildChoice;
  villagerRelationships: Partial<Record<VillagerId, VillagerRelationship>>;
}

/** The merged household, with what changed and what was skipped as a conflict. */
export interface HouseholdMergeResult extends Household {
  conflicts: MergeConflict[];
  counts: { childChoice: number; villagerRelationships: number };
}

export type RelationshipActionValue =
  | "married"
  | "no"
  | "platonic"
  | "proposed"
  | "romantic"
  | "yes";

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
  childChoice: ChildChoice;
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

/**
 * Merges an imported household into the local one without mutating either. The policy:
 *
 * - No local spouse: an incoming marriage applies silently and cascades every other dateable
 *   villager to platonic. This is the one allowed downgrade.
 * - Different spouses: one spouse conflict; the incoming marriage and child choice are skipped,
 *   while other villagers still merge.
 * - Same spouse: an incoming non-married value for the local spouse is a conflict, and disputes
 *   the household its child choice would apply to.
 * - Everyone else: a forward move within a branch (undecided → anything, romantic → proposed) is
 *   silent; a move between branches or backward is a conflict. An incoming "undecided" or an
 *   omitted villager is a no-op.
 * - Child choice applies only against a settled household, and conflicts when both sides declared
 *   different choices.
 */
export function mergeHousehold(
  local: Readonly<Household>,
  incoming: Partial<Household>,
): HouseholdMergeResult {
  const conflicts: MergeConflict[] = [];
  const counts = { childChoice: 0, villagerRelationships: 0 };
  const villagerRelationships = { ...local.villagerRelationships };
  let childChoice = local.childChoice;

  const localMarried = getMarriedVillager(villagerRelationships);
  // The spouse whose household the incoming child choice may apply to, if that household is settled.
  let householdVillagerId: null | VillagerId = localMarried;

  if (incoming.villagerRelationships) {
    const importedRelationships = incoming.villagerRelationships;
    const importedMarried = getMarriedVillager(importedRelationships);
    // Spouses, past or present, that the general per-villager pass must not touch.
    const skipVillagerIds = new Set<VillagerId>();
    // A new marriage forces every other dateable villager to platonic, so the general pass must
    // not evaluate them for conflicts at all.
    let skipGeneralPass = false;

    if (localMarried === null && importedMarried !== null) {
      villagerRelationships[importedMarried] = "married";
      counts.villagerRelationships++;
      householdVillagerId = importedMarried;
      skipGeneralPass = true;
    } else if (
      localMarried !== null &&
      importedMarried !== null &&
      importedMarried !== localMarried
    ) {
      conflicts.push({
        incomingVillagerId: importedMarried,
        kind: "spouse",
        localVillagerId: localMarried,
      });
      skipVillagerIds.add(localMarried);
      skipVillagerIds.add(importedMarried);
      householdVillagerId = null;
    } else if (localMarried !== null) {
      const importedLocalSpouseRel = importedRelationships[localMarried];
      if (importedLocalSpouseRel && importedLocalSpouseRel !== "married") {
        conflicts.push({
          incomingRelationship: importedLocalSpouseRel,
          kind: "relationship",
          localRelationship: "married",
          villagerId: localMarried,
        });
        householdVillagerId = null;
      }
      skipVillagerIds.add(localMarried);
    }

    if (!skipGeneralPass) {
      for (const [villagerIdStr, importedRel] of Object.entries(importedRelationships)) {
        const villagerId = villagerIdStr as VillagerId;
        if (!importedRel || importedRel === "undecided" || skipVillagerIds.has(villagerId)) {
          continue;
        }

        const localRel = villagerRelationships[villagerId] ?? "undecided";
        if (localRel === importedRel) continue;

        const movesForward =
          localRel === "undecided" ||
          (relationshipBranch(localRel) === relationshipBranch(importedRel) &&
            relationshipRank(importedRel) > relationshipRank(localRel));
        if (movesForward) {
          villagerRelationships[villagerId] = importedRel;
          counts.villagerRelationships++;
        } else {
          conflicts.push({
            incomingRelationship: importedRel,
            kind: "relationship",
            localRelationship: localRel,
            villagerId,
          });
        }
      }
    }

    normalizeRelationships(villagerRelationships);
  }

  const importedChoice = incoming.childChoice;
  if (
    householdVillagerId !== null &&
    importedChoice !== undefined &&
    importedChoice !== "undeclared"
  ) {
    if (childChoice === "undeclared") {
      childChoice = importedChoice;
      counts.childChoice = 1;
    } else if (childChoice !== importedChoice) {
      conflicts.push({
        incomingChildChoice: importedChoice,
        kind: "childChoice",
        localChildChoice: childChoice,
        villagerId: householdVillagerId,
      });
    }
  }

  return { childChoice, conflicts, counts, villagerRelationships };
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
