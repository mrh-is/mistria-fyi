export interface AcquisitionReferenceIndexInput {
  emitted?: AcquisitionReferenceRegistries;
  excluded?: AcquisitionReferenceRegistries;
  native?: AcquisitionReferenceRegistries;
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
    this.#addRegistries(input.emitted, this.#references);
    this.#addRegistries(input.native, this.#references);
    this.#addRegistries(input.excluded, this.#excluded);
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

  #addRegistries(
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
