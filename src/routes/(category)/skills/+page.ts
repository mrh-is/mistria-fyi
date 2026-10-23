import { categoryColor } from "#lib/data/categories.js";
import { getName } from "#lib/data/names.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import * as m from "#lib/paraglide/messages.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(["perks", "skills"], (locale) => ({
  accent: categoryColor("skills"),
  description: m.skills_page_description({}, { locale }),
  title: getName("ui", "skills", locale),
}));
