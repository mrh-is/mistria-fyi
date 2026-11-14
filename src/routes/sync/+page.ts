import { localizedPageLoad } from "#lib/data/page-load.js";

import type { RobotsDirective } from "#lib/data/page-metadata.js";

import type { PageLoad } from "./$types";

// A follow link's fragment holds a key, so the page stays out of search & sitemaps.
export const _robots: RobotsDirective = "noindex, nofollow";

export const load: PageLoad = localizedPageLoad([], () => ({
  description: "Sync your Fields of Mistria save file to the field guide on any device.",
  robots: _robots,
  title: "Sync your save file",
  toolbar: "hidden",
}));
