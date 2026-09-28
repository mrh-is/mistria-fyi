import { categoryColor } from "$lib/data/categories";
import { getName } from "$lib/data/names";
import { localizedPageLoad } from "$lib/data/page-load";
import * as m from "$lib/paraglide/messages.js";
import { SEGMENT_LOOKUP_CATEGORIES } from "$lib/utils/segment-lookups";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["animals", "pets/cosmetic_sets", "pets/skins", ...SEGMENT_LOOKUP_CATEGORIES],
  (locale) => ({
    accent: categoryColor("animals"),
    description: m.animals_page_description({}, { locale }),
    title: getName("ui", "animals", locale),
    toolbar: { worldState: true },
  }),
);
