import { localizedPageLoad } from "#lib/data/page-load.js";
import * as m from "#lib/paraglide/messages.js";

import type { RobotsDirective } from "#lib/data/page-metadata.js";

import type { PageLoad } from "./$types";

// A follow link's fragment holds a key, so the page stays out of search & sitemaps.
export const _robots: RobotsDirective = "noindex, nofollow";

export const load: PageLoad = localizedPageLoad([], (locale) => ({
  description: m.sync_page_description({}, { locale }),
  robots: _robots,
  title: m.sync_page_title({}, { locale }),
  toolbar: "hidden",
}));
