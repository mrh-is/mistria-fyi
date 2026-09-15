import type { PageMetadata } from "$lib/data/page-metadata.js";

import type { PageLoad } from "./$types.js";

export const _pageMetadata = {
  description:
    "Learn about the independent, unofficial Mistria Field Guide and the Fields of Mistria data it uses.",
  path: "/about",
  title: "About",
} as const satisfies PageMetadata;

export const load = (() => ({ metadata: _pageMetadata })) satisfies PageLoad;
