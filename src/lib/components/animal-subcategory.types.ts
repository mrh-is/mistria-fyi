import type { ReportCategory } from "#lib/feedback/types.js";
import type { SegmentLookups } from "#lib/sources/source-segments.js";
import type { Source } from "#lib/types/acquisition.js";
import type { LocaleCode } from "#lib/types/locale.js";
import type { AnimalId, AnyId } from "#lib/types/tracker-data.js";

export interface AnimalSubcategoryProps<Id extends AnyId> {
  areAllAnimalsComplete: () => boolean;
  completionCheck: (animalId: AnimalId, itemId: Id) => boolean;
  hasDisplayableItem: (animalId: AnimalId) => boolean;
  isAnimalComplete: (animalId: AnimalId) => boolean;
  locale: LocaleCode;
  lookups?: Omit<SegmentLookups, "entityVisibility">;
  name: string;
  reportCategory: ReportCategory;
  sectionConfig: (animalId: AnimalId) => AnimalSubcategorySectionConfig<Id>;
  toggleCompletion: (animalId: AnimalId, itemId: Id) => void;
}

export interface AnimalSubcategoryRowProps<Id extends AnyId> {
  completed: boolean;
  id: Id;
  name: string;
  sources: Source[];
  spoilered: boolean;
  subtitle?: string;
}

export interface AnimalSubcategorySectionConfig<Id extends AnyId> {
  displayableCompletedItemCount: number;
  displayableItemCount: number;
  isVisible: boolean;
  visibleItems: AnimalSubcategoryRowProps<Id>[];
}
