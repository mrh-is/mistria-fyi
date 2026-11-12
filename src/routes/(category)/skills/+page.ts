import { categoryColor } from "#lib/data/categories.js";
import { getName } from "#lib/data/names.js";
import { localizedPageLoad } from "#lib/data/page-load.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(["perks", "skills"], (locale) => ({
  accent: categoryColor("skills"),
  description: "Track skill levels & perks in Fields of Mistria.",
  title: getName("ui", "skills", locale),
  toolbar: { search: true },
}));
