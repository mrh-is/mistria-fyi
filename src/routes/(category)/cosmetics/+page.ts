import { categoryColor } from "$lib/data/categories";
import { localizedPageLoad } from "$lib/data/page-load";
import * as m from "$lib/paraglide/messages.js";
import { SEGMENT_LOOKUP_CATEGORIES } from "$lib/utils/segment-lookups";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["cosmetics", "cosmetics/subcategories", ...SEGMENT_LOOKUP_CATEGORIES],
  (locale) => ({
    accent: categoryColor("cosmetics"),
    description: m.cosmetics_page_description({}, { locale }),
    title: m.category_cosmetics_name({}, { locale }),
  }),
);
