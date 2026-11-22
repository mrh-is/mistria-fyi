import { trackerData } from "#lib/data/index.js";
import { nameCollator } from "#lib/data/names.js";
import { sourceFilterLabel } from "#lib/data/source-filters.js";
import { isConditionVisible } from "#lib/engine/visibility.js";
import { inLocale } from "#lib/i18n/locale-runtime.js";
import { buildCraftingStationLabel, buildSourceSegments } from "#lib/sources/source-segments.js";

import type { SourceChecklistRow } from "#lib/controllers/source-checklist.js";
import type { UserProgressionState } from "#lib/engine/visibility.js";
import type { SourceSection, SourceTypeGroup } from "#lib/presentation/source-groups.js";
import type { SegmentLookups, SourceSegment } from "#lib/sources/source-segments.js";
import type { Source } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";

export function sourceTypeLabel(group: SourceTypeGroup, locale: LocaleCode): string {
  return inLocale(locale, () => formatSourceTypeLabel(group, locale));
}

function formatSourceTypeLabel(group: SourceTypeGroup, locale: LocaleCode): string {
  if (group === "quests") return "Quests";
  if (group === "gifts") return "Spouse gifts";
  if (group === "monsters") return "Monsters";
  if (group === "progress") return /* @wc-context: everything progress */ "Progress";
  return sourceFilterLabel(group, locale);
}

/** The place named by a source, using its first location or water type when it has several. */
export function sourcePlaceName(source: Source, lookups: SegmentLookups): string | undefined {
  if (source.type === "recipe") return buildCraftingStationLabel(source.recipeId, lookups);
  if (source.type === "station") return lookups.stationNames[source.stationId];
  if (source.type === "animal_product" && source.animalId) {
    return lookups.animalNames[source.animalId];
  }
  if (
    source.type === "secret_chest" ||
    (source.type === "date_inspiration_drop" && "locationId" in source)
  ) {
    return lookups.locationNames[source.locationId];
  }
  if (source.type === "museum_donation") return lookups.museumWingNames[source.wingId];
  return namedSourceInstance(source, lookups);
}

function namedSourceInstance(source: Source, lookups: SegmentLookups): string | undefined {
  let name: string | undefined;
  if ("storeId" in source && source.type !== "festival") {
    name = lookups.stores[source.storeId]?.name;
  } else if ("festivalId" in source) {
    name = lookups.festivals[source.festivalId]?.name;
  } else if ("biomeId" in source && source.biomeId) {
    name = lookups.biomes.find(({ id }) => id === source.biomeId)?.name;
  } else if ("locationIds" in source && source.locationIds) {
    name = lookups.locationNames[source.locationIds[0]];
  } else if ("waterTypes" in source && source.waterTypes) {
    name = lookups.waterNames[source.waterTypes[0]];
  } else if ("monsterId" in source) {
    name = lookups.monsterNames[source.monsterId];
  } else if (source.type === "quest") {
    name = lookups.questNames[source.questId];
  } else if (source.type === "spouseGift" || source.type === "proposal") {
    name = lookups.villagerNames[source.villagerId];
  }
  return name;
}

/** Names come from the same localized tables & gated sentences as acquisition cards. */
export function sourceSectionLabel(
  section: SourceSection<SourceChecklistRow>,
  lookups: SegmentLookups,
  progression: UserProgressionState,
): { name: string; spoilered: boolean } {
  const { source } = section;
  if (!source) {
    return { name: sourceTypeLabel("progress", lookups.locale), spoilered: false };
  }
  const name = namedSourceInstance(source, lookups);
  if (name !== undefined) return { name, spoilered: section.spoilered };

  let spoilered = section.spoilered;
  function text(segments: SourceSegment[]): string {
    return segments
      .map((segment) => {
        if (typeof segment === "string") return segment;
        if ("condition" in segment) {
          if (!isConditionVisible(segment.condition, progression)) spoilered = true;
          return text(segment.unspoilered);
        }
        spoilered = true;
        return "";
      })
      .join("");
  }
  const label = text(buildSourceSegments(source, lookups));
  return {
    name: label,
    spoilered,
  };
}

/** Completed sources sort last; festivals & biomes use game order, others localized names. */
export function compareSourceSections(
  a: { name: string; section: SourceSection<SourceChecklistRow> },
  b: { name: string; section: SourceSection<SourceChecklistRow> },
  locale: LocaleCode,
): number {
  const aOrder = sourceGameOrder(a.section);
  const bOrder = sourceGameOrder(b.section);
  if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) return aOrder - bOrder;
  return nameCollator(locale).compare(a.name, b.name) || a.section.id.localeCompare(b.section.id);
}

function sourceGameOrder(section: SourceSection<SourceChecklistRow>): number | undefined {
  const { source } = section;
  if (source && "festivalId" in source) {
    const date = trackerData.festivals[source.festivalId].date;
    return ["spring", "summer", "fall", "winter"].indexOf(date.season) * 28 + date.day;
  }
  if (source && "biomeId" in source && source.biomeId) {
    return trackerData.mines.biomes.findIndex(({ id }) => id === source.biomeId);
  }
  return undefined;
}
