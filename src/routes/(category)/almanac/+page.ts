import { categoryColor } from "$lib/data/categories";
import { getName } from "$lib/data/names";
import { localizedPageLoad } from "$lib/data/page-load";
import * as m from "$lib/paraglide/messages.js";
import { SEGMENT_LOOKUP_CATEGORIES } from "$lib/utils/segment-lookups";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["dates", "items", ...SEGMENT_LOOKUP_CATEGORIES],
  (locale) => ({
    accent: categoryColor("almanac"),
    description: m.almanac_page_description({}, { locale }),
    title: getName("ui", "almanac", locale),
    toolbar: { search: true, worldState: true },
  }),
);
