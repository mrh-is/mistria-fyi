import { categoryColor } from "#lib/data/categories.js";
import { getName } from "#lib/data/names.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import { SEGMENT_LOOKUP_NAME_CHUNKS } from "#lib/sources/segment-lookups.js";
import * as m from "#lib/ui-messages/messages.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["items", "museum_wings", ...SEGMENT_LOOKUP_NAME_CHUNKS],
  (locale) => ({
    accent: categoryColor("museum"),
    description: m.museum_page_description({}, { locale }),
    title: getName("ui", "museum", locale),
    toolbar: { clock: true, filter: true, search: true },
  }),
);
