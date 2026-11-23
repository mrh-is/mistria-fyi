import { categoryColor } from "#lib/data/categories.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import { SEGMENT_LOOKUP_NAME_CHUNKS } from "#lib/sources/segment-lookups.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad([...SEGMENT_LOOKUP_NAME_CHUNKS, "spells"], () => ({
  accent: categoryColor("mines"),
  description: "Track mine floors, spells, & exploration progress in Fields of Mistria.",
  title: "Mines",
  toolbar: { clock: true, filter: true, search: true },
}));
