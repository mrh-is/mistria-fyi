import type { PageMetadata } from "$lib/data/page-metadata.js";

import type { PageLoad } from "./$types.js";

export const _pageMetadata = {
  description:
    "Read how the Mistria Field Guide stores Fields of Mistria progress, handles feedback, and protects your privacy.",
  path: "/privacy",
  title: "Privacy policy",
} as const satisfies PageMetadata;

export const load = (() => ({ metadata: _pageMetadata })) satisfies PageLoad;
