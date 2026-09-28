import { categoryColor } from "$lib/data/categories";
import { localizedPageLoad } from "$lib/data/page-load";
import * as m from "$lib/paraglide/messages.js";
import { SEGMENT_LOOKUP_CATEGORIES } from "$lib/utils/segment-lookups";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["items", "villagers", "quests", "recipes", ...SEGMENT_LOOKUP_CATEGORIES],
  (locale) => ({
    accent: categoryColor("quests"),
    description: m.quests_page_description({}, { locale }),
    title: m.category_quests_name({}, { locale }),
  }),
);
