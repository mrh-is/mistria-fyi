import { categoryColor } from "#lib/data/categories.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import * as m from "#lib/paraglide/messages.js";
import { SEGMENT_LOOKUP_CATEGORIES } from "#lib/sources/segment-lookups.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["cosmetics", "cosmetics/subcategories", ...SEGMENT_LOOKUP_CATEGORIES],
  (locale) => ({
    accent: categoryColor("cosmetics"),
    description: m.cosmetics_page_description({}, { locale }),
    title: m.category_cosmetics_name({}, { locale }),
  }),
);
