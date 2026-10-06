import { categoryColor } from "#lib/data/categories.js";
import { getName } from "#lib/data/names.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import * as m from "#lib/paraglide/messages.js";
import { SEGMENT_LOOKUP_CATEGORIES } from "#lib/sources/segment-lookups.js";

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
