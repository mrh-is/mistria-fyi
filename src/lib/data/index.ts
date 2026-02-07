import trackerDataJson from "./tracker-data.json";

import type { TrackerData } from "$lib/types/tracker-data.js";

export const trackerData = trackerDataJson as unknown as TrackerData;
