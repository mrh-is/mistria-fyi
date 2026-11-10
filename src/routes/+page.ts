import { localizedPageLoad } from "#lib/data/page-load.js";
import { SITE_NAME } from "#lib/data/page-metadata.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad([], (_locale) => ({
  description:
    "Track museum donations, almanac finds, recipes, relationships, skills, quests, & more in Fields of Mistria, as you work toward 100% completion.",
  title: SITE_NAME,
  toolbar: { clock: true, search: true },
}));
