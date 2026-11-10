import { localizedPageLoad } from "#lib/data/page-load.js";
import { loadAboutCatalog } from "#lib/i18n/about-ui.js";
import * as m from "#lib/paraglide/messages.js";

import type { PageLoad } from "./$types";

const loadMetadata = localizedPageLoad([], (locale) => ({
  description: m.about_page_description({}, { locale }),
  title: m.about_title({}, { locale }),
  toolbar: "hidden",
}));

export const load: PageLoad = async (event) => {
  const { locale } = await event.parent();
  const [metadata, aboutCatalog] = await Promise.all([
    loadMetadata(event),
    loadAboutCatalog(locale),
  ]);
  return { ...metadata, aboutCatalog };
};
