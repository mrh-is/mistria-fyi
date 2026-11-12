import { categoryColor } from "#lib/data/categories.js";
import { getName } from "#lib/data/names.js";
import { localizedPageLoad } from "#lib/data/page-load.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(["villagers"], (locale) => ({
  accent: categoryColor("villagers"),
  description: "Track friendship & romance with the villagers of Fields of Mistria.",
  title: getName("ui", "villagers", locale),
  toolbar: { search: true },
}));
