import { redirect } from "@sveltejs/kit";

import { localizedPageLoad } from "#lib/data/page-load.js";
import * as m from "#lib/paraglide/messages.js";
import { localizeHref } from "#lib/paraglide/runtime.js";
import { syncEnabled } from "#lib/sync/enabled.js";

import type { RobotsDirective } from "#lib/data/page-metadata.js";

import type { PageLoad } from "./$types";

// A follow link's fragment holds a key, so the page stays out of search & sitemaps.
export const _robots: RobotsDirective = "noindex, nofollow";

const pageLoad: PageLoad = localizedPageLoad([], (locale) => ({
  description: m.sync_page_description({}, { locale }),
  robots: _robots,
  title: m.sync_page_title({}, { locale }),
  toolbar: "hidden",
}));

/** Sync is hidden on the production site until launch (#291), so the page sends players Home. */
export const load: PageLoad = (event) => {
  if (!syncEnabled) redirect(307, localizeHref("/"));
  return pageLoad(event);
};
