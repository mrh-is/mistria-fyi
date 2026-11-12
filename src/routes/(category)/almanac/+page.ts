import { categoryColor } from "#lib/data/categories.js";
import { getName } from "#lib/data/names.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import { SEGMENT_LOOKUP_NAME_CHUNKS } from "#lib/sources/segment-lookups.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad(
  ["dates", "items", ...SEGMENT_LOOKUP_NAME_CHUNKS],
  (locale) => ({
    accent: categoryColor("almanac"),
    description:
      "Track crops, forage, fish, insects, artifacts, & other almanac entries in Fields of Mistria.",
    title: getName("ui", "almanac", locale),
    toolbar: { clock: true, filter: true, search: true },
  }),
);
