export interface AcquisitionReferenceIndexInput {
  emitted?: AcquisitionReferenceRegistries;
  excluded?: AcquisitionReferenceRegistries;
  native?: AcquisitionReferenceRegistries;
  /**
   * Reviewed IDs that no parsed table defines. Each must be absent from `emitted` & `native`; an
   * entry the game now defines is obsolete and throws, like an obsolete reviewed override.
   */
  reviewed?: AcquisitionReferenceRegistries;
}

export type AcquisitionReferenceKind =
  | "activity"
  | "animal"
  | "biome"
  | "cosmetic"
  | "date"
  | "dialogueChoice"
  | "dungeonLootGroup"
  | "festival"
  | "item"
  | "letter"
  | "location"
  | "monster"
  | "perk"
  | "quest"
  | "questType"
  | "recipe"
  | "skill"
  | "station"
  | "store"
  | "treasureChestTier"
  | "villager"
  | "waterType"
  | "wing";

export interface AcquisitionReferenceRegistries {
  activities?: ReferenceRegistry;
  animals?: ReferenceRegistry;
  biomes?: ReferenceRegistry;
  cosmetics?: ReferenceRegistry;
  dates?: ReferenceRegistry;
  dialogueChoices?: ReferenceRegistry;
  dungeonLootGroups?: ReferenceRegistry;
  festivals?: ReferenceRegistry;
  items?: ReferenceRegistry;
  letters?: ReferenceRegistry;
  locations?: ReferenceRegistry;
  monsters?: ReferenceRegistry;
  perks?: ReferenceRegistry;
  quests?: ReferenceRegistry;
  questTypes?: ReferenceRegistry;
  recipes?: ReferenceRegistry;
  skills?: ReferenceRegistry;
  stations?: ReferenceRegistry;
  stores?: ReferenceRegistry;
  treasureChestTiers?: ReferenceRegistry;
  villagers?: ReferenceRegistry;
  waterTypes?: ReferenceRegistry;
  wings?: ReferenceRegistry;
}

type ReferenceRegistry = Iterable<string | { id: string }> | Readonly<Record<string, unknown>>;

const REGISTRY_KIND = {
  activities: "activity",
  animals: "animal",
  biomes: "biome",
  cosmetics: "cosmetic",
  dates: "date",
  dialogueChoices: "dialogueChoice",
  dungeonLootGroups: "dungeonLootGroup",
  festivals: "festival",
  items: "item",
  letters: "letter",
  locations: "location",
  monsters: "monster",
  perks: "perk",
  quests: "quest",
  questTypes: "questType",
  recipes: "recipe",
  skills: "skill",
  stations: "station",
  stores: "store",
  treasureChestTiers: "treasureChestTier",
  villagers: "villager",
  waterTypes: "waterType",
  wings: "wing",
} as const satisfies Record<keyof AcquisitionReferenceRegistries, AcquisitionReferenceKind>;

export class AcquisitionReferenceIndex {
  readonly #excluded = emptyReferenceSets();
  readonly #references = emptyReferenceSets();

  constructor(input: AcquisitionReferenceIndexInput = {}) {
    addRegistries(input.emitted, this.#references);
    addRegistries(input.native, this.#references);
    const reviewed = emptyReferenceSets();
    addRegistries(input.reviewed, reviewed);
    for (const [kind, ids] of Object.entries(reviewed) as [
      AcquisitionReferenceKind,
      Set<string>,
    ][]) {
      for (const id of ids) {
        if (this.#references[kind].has(id)) {
          throw new Error(
            `Obsolete reviewed reference: ${kind} ID "${id}" is now defined by game data`,
          );
        }
        this.#references[kind].add(id);
      }
    }
    addRegistries(input.excluded, this.#excluded);
  }

  static from(input: AcquisitionReferenceIndexInput): AcquisitionReferenceIndex {
    return new AcquisitionReferenceIndex(input);
  }

  has(kind: AcquisitionReferenceKind, id: string): boolean {
    return this.#references[kind].has(id);
  }

  isExcluded(kind: AcquisitionReferenceKind, id: string): boolean {
    return this.#excluded[kind].has(id);
  }
}

function addRegistries(
  registries: AcquisitionReferenceRegistries | undefined,
  target: Record<AcquisitionReferenceKind, Set<string>>,
): void {
  if (!registries) return;
  for (const [registryName, registry] of Object.entries(registries) as [
    keyof AcquisitionReferenceRegistries,
    ReferenceRegistry | undefined,
  ][]) {
    if (!registry) continue;
    const kind = REGISTRY_KIND[registryName];
    for (const id of registryIds(registryName, registry)) target[kind].add(id);
    if (registryName === "quests" && !isIterable(registry)) {
      for (const [groupId, group] of Object.entries(registry)) {
        if (
          typeof group === "object" &&
          group !== null &&
          !Array.isArray(group) &&
          !("name" in group)
        ) {
          target.questType.add(groupId);
        }
      }
    }
  }
}

function emptyReferenceSets(): Record<AcquisitionReferenceKind, Set<string>> {
  return {
    activity: new Set(),
    animal: new Set(),
    biome: new Set(),
    cosmetic: new Set(),
    date: new Set(),
    dialogueChoice: new Set(),
    dungeonLootGroup: new Set(),
    festival: new Set(),
    item: new Set(),
    letter: new Set(),
    location: new Set(),
    monster: new Set(),
    perk: new Set(),
    quest: new Set(),
    questType: new Set(),
    recipe: new Set(),
    skill: new Set(),
    station: new Set(),
    store: new Set(),
    treasureChestTier: new Set(),
    villager: new Set(),
    waterType: new Set(),
    wing: new Set(),
  };
}

function isIterable(value: ReferenceRegistry): value is Iterable<string | { id: string }> {
  return typeof value === "object" && value !== null && Symbol.iterator in value;
}

function registryIds(
  registryName: keyof AcquisitionReferenceRegistries,
  registry: ReferenceRegistry,
): string[] {
  if (!isIterable(registry)) {
    if (registryName === "quests") {
      return Object.entries(registry).flatMap(([groupId, group]) => {
        if (
          typeof group === "object" &&
          group !== null &&
          !Array.isArray(group) &&
          !("name" in group)
        ) {
          return Object.keys(group);
        }
        return [groupId];
      });
    }
    return Object.keys(registry);
  }
  return [...registry].map((entry) => (typeof entry === "string" ? entry : entry.id));
}
