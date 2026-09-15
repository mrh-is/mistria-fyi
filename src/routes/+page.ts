import type { PageMetadata } from "$lib/data/page-metadata.js";

import type { PageLoad } from "./$types.js";

export const _pageMetadata = {
  description:
    "Track museum donations, almanac finds, recipes, relationships, skills, quests, and more in Fields of Mistria.",
  path: "/",
  title: "Fields of Mistria completion tracker",
} as const satisfies PageMetadata;

export const load = (() => ({ metadata: _pageMetadata })) satisfies PageLoad;
