import { SITE_NAME } from "$lib/data/page-metadata.js";

import type { PageLoad } from "./$types.js";

export const load: PageLoad = () => ({
  metadata: {
    description:
      "Track museum donations, almanac finds, recipes, relationships, skills, quests, and more in Fields of Mistria.",
    title: SITE_NAME,
  },
});
