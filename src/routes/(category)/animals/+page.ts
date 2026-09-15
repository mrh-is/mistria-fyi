import type { PageMetadata } from "$lib/data/page-metadata.js";

import type { PageLoad } from "./$types.js";

export const _pageMetadata = {
  description: "Track animal breeds, colors, and cosmetics for your Fields of Mistria farm.",
  path: "/animals",
  title: "Animals tracker",
} as const satisfies PageMetadata;

export const load = (() => ({ metadata: _pageMetadata })) satisfies PageLoad;
