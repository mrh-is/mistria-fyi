import { loadPageNames } from "$lib/data/names.js";
import { pageMetadata } from "$lib/data/page-metadata.js";
import * as m from "$lib/paraglide/messages.js";
import { baseLocale, getLocaleForUrl } from "$lib/paraglide/runtime.js";

import type { PageLoad } from "./$types";

// The sitemap generator harvests `metadata.robots` from every route by calling `load()` with no
// event at all (see `MetadataPageModule` in `src/routes/sitemap.xml/+server.ts`), so `url` isn't
// always present; fall back to the base locale in that case.
export const load: PageLoad = async (event?: Partial<Parameters<PageLoad>[0]>) => {
  const locale = event?.url ? getLocaleForUrl(event.url) : baseLocale;
  // The merge summary's household-conflict messages name villagers by their localized display name.
  await loadPageNames(event, ["villagers"]);
  return {
    metadata: pageMetadata({
      description: m.data_page_description({}, { locale }),
      robots: "noindex, follow",
      title: m.data_title({}, { locale }),
      toolbar: "hidden",
    }),
  };
};
