import { categoryColor } from "#lib/data/categories.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import { SEGMENT_LOOKUP_NAME_CHUNKS } from "#lib/sources/segment-lookups.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["items", ...SEGMENT_LOOKUP_NAME_CHUNKS],
  (_locale) => ({
    accent: categoryColor("recipes"),
    description: "Track cooking & crafting recipes in Fields of Mistria.",
    title: "Recipes",
    toolbar: { clock: true, filter: true, search: true },
  }),
);
