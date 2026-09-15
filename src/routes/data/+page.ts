import type { PageMetadata } from "$lib/data/page-metadata.js";

import type { PageLoad } from "./$types.js";

export const _pageMetadata = {
  description:
    "Import, transfer, back up, restore, or reset your Fields of Mistria tracking progress.",
  path: "/data",
  robots: "noindex, follow",
  title: "Data management",
} as const satisfies PageMetadata;

export const load = (() => ({ metadata: _pageMetadata })) satisfies PageLoad;
