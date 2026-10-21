import { localizedPageLoad } from "#lib/data/page-load.js";
import * as m from "#lib/paraglide/messages.js";

import type { RobotsDirective } from "#lib/data/page-metadata.js";

import type { PageLoad } from "./$types";

export const prerender = true;

export const _robots: RobotsDirective = "noindex, follow";

// The merge summary's household-conflict messages name villagers by their localized display name.
export const load: PageLoad = localizedPageLoad(["villagers"], (locale) => ({
  description: m.data_page_description({}, { locale }),
  robots: _robots,
  title: m.data_title({}, { locale }),
  toolbar: "hidden",
}));
