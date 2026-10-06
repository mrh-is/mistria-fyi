import trackerDataJson from "./tracker-data.json";
import { buildTrackerIndex } from "./tracker-index.js";

import type { TrackerData } from "#lib/types/tracker-data.js";

export const trackerData = trackerDataJson as unknown as TrackerData;
export const trackerIndex = buildTrackerIndex(trackerData);
