import type { PageMetadata } from "$lib/data/page-metadata.js";

import type { PageLoad } from "./$types.js";

export const _pageMetadata = {
  description: "Track story quests, requests, and other objectives in Fields of Mistria.",
  path: "/quests",
  title: "Quest tracker",
} as const satisfies PageMetadata;

export const load = (() => ({ metadata: _pageMetadata })) satisfies PageLoad;
