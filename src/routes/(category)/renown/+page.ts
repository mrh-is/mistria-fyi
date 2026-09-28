import { categoryColor } from "$lib/data/categories";
import { getName } from "$lib/data/names";
import { localizedPageLoad } from "$lib/data/page-load";
import * as m from "$lib/paraglide/messages.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(["town-ranks"], (locale) => ({
  accent: categoryColor("renown"),
  description: m.renown_page_description({}, { locale }),
  title: getName("ui", "renown", locale),
}));
