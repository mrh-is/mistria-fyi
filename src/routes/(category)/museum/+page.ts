import { categoryColor } from "$lib/data/categories";
import { getName } from "$lib/data/names";
import { localizedPageLoad } from "$lib/data/page-load";
import * as m from "$lib/paraglide/messages.js";
import { SEGMENT_LOOKUP_CATEGORIES } from "$lib/utils/segment-lookups";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["items", "museum_wings", ...SEGMENT_LOOKUP_CATEGORIES],
  (locale) => ({
    accent: categoryColor("museum"),
    description: m.museum_page_description({}, { locale }),
    title: getName("ui", "museum", locale),
    toolbar: { search: true, worldState: true },
  }),
);
