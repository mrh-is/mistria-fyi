import { localizedPageLoad } from "#lib/data/page-load.js";
import { SITE_NAME } from "#lib/data/page-metadata.js";
import * as m from "#lib/ui-messages/messages.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad([], (locale) => ({
  description: m.home_page_description({}, { locale }),
  title: SITE_NAME,
  toolbar: { clock: true, search: true },
}));
