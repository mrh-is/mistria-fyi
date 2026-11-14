import { categoryColor } from "#lib/data/categories.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import { SEGMENT_LOOKUP_NAME_CHUNKS } from "#lib/sources/segment-lookups.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["items", "villagers", "quests", "recipes", ...SEGMENT_LOOKUP_NAME_CHUNKS],
  () => ({
    accent: categoryColor("quests"),
    description: "Track story quests, requests, & other objectives in Fields of Mistria.",
    title: "Quests",
    toolbar: { clock: true, filter: true, search: true },
  }),
);
