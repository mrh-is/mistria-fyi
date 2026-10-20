import { categoryColor } from "#lib/data/categories.js";
import { getName } from "#lib/data/names.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import * as m from "#lib/paraglide/messages.js";
import { SEGMENT_LOOKUP_NAME_CHUNKS } from "#lib/sources/segment-lookups.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["animals", "mount", "pets/cosmetic_sets", "pets/skins", ...SEGMENT_LOOKUP_NAME_CHUNKS],
  (locale) => ({
    accent: categoryColor("animals"),
    description: m.animals_page_description({}, { locale }),
    title: getName("ui", "animals", locale),
    toolbar: { worldState: true },
  }),
);
