import { localizedPageLoad } from "#lib/data/page-load.js";
import * as m from "#lib/paraglide/messages.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad([], (locale) => ({
  description: m.privacy_page_description({}, { locale }),
  title: m.privacy_title({}, { locale }),
  toolbar: "hidden",
}));
