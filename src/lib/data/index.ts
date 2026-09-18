import trackerDataJson from "./tracker-data.json";
import { buildTrackerIndex } from "./tracker-index";

import type { ItemId, TrackerData } from "$lib/types/tracker-data.js";

export const trackerData = trackerDataJson as unknown as TrackerData;
export const trackerIndex = buildTrackerIndex(trackerData);
export const canonicalAlmanacId: ReadonlyMap<ItemId, ItemId> =
  trackerIndex.memberToCanonicalAlmanacId;
