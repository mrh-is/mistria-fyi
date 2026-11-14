import { trackerData } from "#lib/data/index.js";
import { isSourceVisible } from "#lib/engine/availability.js";
import { recordEntries } from "#lib/utils/record.js";

import type { UserProgressionState } from "#lib/engine/visibility.js";
import type { StoreId } from "#lib/types/tracker-data.js";

/** Stores whose visibility condition the player hasn't met, so their names stay spoilered. */
export function computeSpoileredStoreIds(state: UserProgressionState): Set<StoreId> {
  return new Set(
    recordEntries(trackerData.stores)
      .filter(([id]) => !isSourceVisible({ type: "store", storeId: id }, state))
      .map(([id]) => id),
  );
}
