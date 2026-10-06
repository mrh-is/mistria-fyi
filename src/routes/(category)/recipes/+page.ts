import { categoryColor } from "#lib/data/categories.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import * as m from "#lib/paraglide/messages.js";
import { SEGMENT_LOOKUP_NAME_CHUNKS } from "#lib/sources/segment-lookups.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["items", ...SEGMENT_LOOKUP_NAME_CHUNKS],
  (locale) => ({
    accent: categoryColor("recipes"),
    description: m.recipes_page_description({}, { locale }),
    title: m.category_recipes_name({}, { locale }),
  }),
);
