import { categoryColor } from "#lib/data/categories.js";
import { localizedPageLoad } from "#lib/data/page-load.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(["mines", "spells"], (_locale) => ({
  accent: categoryColor("mines"),
  description: "Track mine floors, spells, & exploration progress in Fields of Mistria.",
  title: "Mines",
  toolbar: { clock: true, filter: true, search: true },
}));
