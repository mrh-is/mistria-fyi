import type { PageMetadata } from "$lib/data/page-metadata.js";

import type { PageLoad } from "./$types.js";

export const _pageMetadata = {
  description:
    "Track crops, forage, fish, insects, artifacts, and other almanac discoveries in Fields of Mistria.",
  path: "/almanac",
  title: "Almanac tracker",
} as const satisfies PageMetadata;

export const load = (() => ({ metadata: _pageMetadata })) satisfies PageLoad;
