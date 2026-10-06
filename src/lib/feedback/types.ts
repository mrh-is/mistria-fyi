/**
 * Stable, locale-independent keys for what a report is about. They land in GitHub issue titles &
 * bodies, so they never come from a localized name (and never vary between "pet skin" & "pet
 * skins" for the same concept).
 */
export const REPORT_CATEGORIES = [
  "almanac",
  "almanac-item",
  "animal",
  "animal-cosmetics",
  "animal-variants",
  "craving-quest",
  "cosmetic",
  "cosmetic-slot",
  "date",
  "dates",
  "mines",
  "museum-item",
  "museum-set",
  "museum-wing",
  "pet-cosmetic",
  "pet-cosmetics",
  "pet-skin",
  "pet-skins",
  "quest",
  "quest-section",
  "rank",
  "recipe",
  "recipe-category",
  "renown",
  "skill",
  "spell",
  "villager",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export interface ReportableElement {
  category: ReportCategory;
  displayName: string;
  entityId?: string;
  extra?: Record<string, number | string>;
  page: string;
}

export function isReportCategory(value: string): value is ReportCategory {
  return (REPORT_CATEGORIES as readonly string[]).includes(value);
}
