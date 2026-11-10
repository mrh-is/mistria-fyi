import { categoryColor } from "#lib/data/categories.js";
import { getName } from "#lib/data/names.js";
import { localizedPageLoad } from "#lib/data/page-load.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(["town-ranks"], (_locale) => ({
  accent: categoryColor("renown"),
  description: "Track your town rank, renown, & rewards in Fields of Mistria.",
  title: getName("ui", "renown", _locale),
  toolbar: { search: true },
}));
