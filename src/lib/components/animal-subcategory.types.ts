import type { Source } from "$lib/types/acquisition";
import type { AnimalId, AnyId } from "$lib/types/tracker-data.js";
import type { SegmentLookups } from "$lib/utils/source-segments.js";

export interface AnimalSubcategoryProps<ItemId extends AnyId> {
  areAllAnimalsComplete: () => boolean;
  completionCheck: (animalId: AnimalId, itemId: ItemId) => boolean;
  hasDisplayableItem: (animalId: AnimalId) => boolean;
  isAnimalComplete: (animalId: AnimalId) => boolean;
  lookups?: Omit<SegmentLookups, "entityVisibility">;
  name: string;
  sectionConfig: (animalId: AnimalId) => AnimalSubcategorySectionConfig<ItemId>;
  toggleCompletion: (animalId: AnimalId, itemId: ItemId) => void;
}

export interface AnimalSubcategoryRowProps<ItemId extends AnyId> {
  completed: boolean;
  id: ItemId;
  name: string;
  redacted: boolean;
  sources: Source[];
}

export interface AnimalSubcategorySectionConfig<ItemId extends AnyId> {
  displayableCompletedItemCount: number;
  displayableItemCount: number;
  isVisible: boolean;
  visibleItems: AnimalSubcategoryRowProps<ItemId>[];
}
