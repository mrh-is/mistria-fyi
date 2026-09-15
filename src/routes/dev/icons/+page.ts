import type { PageMetadata } from "$lib/data/page-metadata.js";

import type { PageLoad } from "./$types.js";

export const _pageMetadata = {
  description:
    "Review the Fields of Mistria icon proof gallery used during Mistria Field Guide development.",
  path: "/dev/icons",
  robots: "noindex, nofollow",
  title: "Icon proof gallery",
} as const satisfies PageMetadata;

export const load = (() => ({ metadata: _pageMetadata })) satisfies PageLoad;
