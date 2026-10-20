import { redirect } from "@sveltejs/kit";

import { localizedPageLoad } from "#lib/data/page-load.js";
import * as m from "#lib/paraglide/messages.js";
import { localizedHref } from "#lib/utils/localized-href.js";
import { browser } from "$app/env";

import type { RobotsDirective } from "#lib/data/page-metadata.js";

import type { PageLoad } from "./$types";

export const prerender = true;

export const _robots: RobotsDirective = "noindex, follow";

const placeholderLoad = localizedPageLoad([], (locale) => ({
  description: m.data_page_description({}, { locale }),
  robots: _robots,
  title: m.data_title({}, { locale }),
  toolbar: "hidden",
}));

/**
 * The retired settings page forwards to data management, keeping `?section=` deep links. It
 * forwards in the browser: a prerendered page can't read its query on the server, and a static
 * page answers before any server redirect could (a server redirect ahead of the service worker
 * is what broke offline relaunches, #18). The server renders an empty page for it to hydrate.
 */
export const load: PageLoad = async (event) => {
  if (browser) {
    const { locale } = await event.parent();
    redirect(308, `${localizedHref("data", { locale })}${event.url.search}`);
  }
  return placeholderLoad(event);
};
