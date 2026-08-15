import { formatBiomeName, seasonLabel } from "./format.js";

import type {
  BiomeId,
  FestivalId,
  ItemId,
  NpcId,
  PerkId,
  QuestId,
  Season,
  StoreId,
} from "$lib/types/tracker-data.js";
import type { VisibilityCondition } from "$lib/types/visibility.js";

import type { RecipeSourceLookups } from "./format.js";

export interface SegmentLookups extends RecipeSourceLookups {
  categoryVisibility: Record<string, VisibilityCondition>;
  festivalDates: Partial<Record<FestivalId, { day: number; season: Season }>>;
  itemVisibility: Partial<Record<ItemId, VisibilityCondition>>;
  npcNames: Partial<Record<NpcId, string>>;
  npcVisibility: Partial<Record<NpcId, VisibilityCondition>>;
  questNpcIds: Partial<Record<QuestId, NpcId>>;
  recipeVisibility: VisibilityCondition;
  storeVisibility: Partial<Record<StoreId, VisibilityCondition>>;
}

export type SourceSegment =
  | string
  | {
      condition: VisibilityCondition;
      redacted?: [SourceSegment, ...SourceSegment[]];
      revealed: [SourceSegment, ...SourceSegment[]];
    }
  | { redacted: true };

export function buildBiomeLabel(
  biomeId: BiomeId,
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const biome = lookups.biomes.find((b) => b.id === biomeId);
  if (!biome) return [titleCase(biomeId)];

  const condition: VisibilityCondition = { floor: biome.startFloor, type: "minesLevel" };
  const biomeName = formatBiomeName(biomeId, lookups.biomes);
  const floorRange = `Mines floors ${String(biome.startFloor)}–${String(biome.endFloor)}`;

  return [
    {
      condition,
      redacted: [
        { redacted: true },
        " (Mines floors ",
        { redacted: true },
        "–",
        { redacted: true },
        ")",
      ],
      revealed: [`${biomeName} (${floorRange})`],
    },
  ];
}

export function buildPerkLabel(
  perkId: PerkId,
  lookups: SegmentLookups,
): [SourceSegment, ...SourceSegment[]] {
  const perk = lookups.perks[perkId as string];
  if (!perk) return [`the ${titleCase(perkId)} perk`];

  const skillName = lookups.skillNames[perk.skillId] ?? titleCase(perk.skillId);
  const tierSuffix = ` (${skillName} tier ${String(perk.tier)})`;
  const condition = perk.visibility;
  if (!condition) return [`the ${perk.name} perk${tierSuffix}`];

  return [
    {
      condition,
      redacted: ["the ", { redacted: true }, ` perk${tierSuffix}`],
      revealed: [`the ${perk.name} perk${tierSuffix}`],
    },
  ];
}

export function buildStoreQualifier(
  sourceVisibility: undefined | VisibilityCondition,
  lookups: SegmentLookups,
  storeId: StoreId,
): SourceSegment[] {
  if (!sourceVisibility || sourceVisibility.type === "always") return [];

  const action = lookups.stores[storeId]?.upgradeAction ?? "upgrading";

  return [
    {
      condition: sourceVisibility,
      redacted: [" (after ", { redacted: true }, ")"],
      revealed: [` (after ${action})`],
    },
  ];
}

export function formatDateLabel(season: Season, day: number): string {
  return `${seasonLabel(season)} ${String(day)}`;
}

function titleCase(s: string): string {
  return s
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
