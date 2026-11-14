import { categoryColor } from "#lib/data/categories.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import { SEGMENT_LOOKUP_NAME_CHUNKS } from "#lib/sources/segment-lookups.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["cosmetics", "cosmetics/subcategories", ...SEGMENT_LOOKUP_NAME_CHUNKS],
  () => ({
    accent: categoryColor("cosmetics"),
    description: "Track wardrobe & appearance unlocks in Fields of Mistria.",
    title: "Cosmetics",
    toolbar: { clock: true, filter: true, search: true },
  }),
);
