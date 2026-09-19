import { getName, loadNames, loadPageNames } from "$lib/data/names.js";
import * as m from "$lib/paraglide/messages.js";
import { baseLocale, getLocaleForUrl } from "$lib/paraglide/runtime.js";
import { SEGMENT_LOOKUP_CATEGORIES } from "$lib/utils/segment-lookups.js";

import type { PageLoad } from "./$types";

// The sitemap generator harvests `metadata.robots` from every route by calling `load()` with no
// event at all (see `MetadataPageModule` in `src/routes/sitemap.xml/+server.ts`), so `url` isn't
// always present; fall back to the base locale in that case.
export const load: PageLoad = async (event?: Partial<Parameters<PageLoad>[0]>) => {
  const locale = event?.url ? getLocaleForUrl(event.url) : baseLocale;
  await loadNames(locale, ["ui"]);
  await loadPageNames(event, ["dates", "items", "ui", ...SEGMENT_LOOKUP_CATEGORIES]);
  return {
    metadata: {
      description: m.almanac_page_description({}, { locale }),
      showSearch: true,
      title: getName("ui", "almanac", locale),
      usesWorldState: true,
    },
  };
};
