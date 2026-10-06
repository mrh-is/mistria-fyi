import { LOCALIZED_CATEGORIES } from "#lib/data/names.js";
import { localizedPageLoad } from "#lib/data/page-load.js";
import * as m from "#lib/paraglide/messages.js";

import type { PageLoad } from "./$types";

// The everything checklist renders every category, so it needs every name chunk.
export const load: PageLoad = localizedPageLoad(LOCALIZED_CATEGORIES, (locale) => ({
  description: m.all_page_description({}, { locale }),
  title: m.all_page_title({}, { locale }),
  toolbar: { worldState: true },
}));
