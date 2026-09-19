import { categoryColor } from "$lib/data/categories.js";
import { loadPageNames } from "$lib/data/names.js";
import { pageMetadata } from "$lib/data/page-metadata.js";
import * as m from "$lib/paraglide/messages.js";
import { baseLocale, getLocaleForUrl } from "$lib/paraglide/runtime.js";
import { SEGMENT_LOOKUP_CATEGORIES } from "$lib/utils/segment-lookups.js";

import type { PageLoad } from "./$types";

// The sitemap generator harvests `metadata.robots` from every route by calling `load()` with no
// event at all (see `MetadataPageModule` in `src/routes/sitemap.xml/+server.ts`), so `url` isn't
// always present; fall back to the base locale in that case.
export const load: PageLoad = async (event?: Partial<Parameters<PageLoad>[0]>) => {
  const locale = event?.url ? getLocaleForUrl(event.url) : baseLocale;
  await loadPageNames(event, ["items", "ui", ...SEGMENT_LOOKUP_CATEGORIES]);
  return {
    metadata: pageMetadata({
      accent: categoryColor("recipes"),
      description: m.recipes_page_description({}, { locale }),
      title: m.category_recipes_name({}, { locale }),
    }),
  };
};
