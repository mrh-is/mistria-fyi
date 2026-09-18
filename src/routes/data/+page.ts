import * as m from "$lib/paraglide/messages.js";
import { baseLocale, getLocaleForUrl } from "$lib/paraglide/runtime.js";

import type { PageLoad } from "./$types";

// The sitemap generator harvests `metadata.robots` from every route by calling `load()` with no
// event at all (see `MetadataPageModule` in `src/routes/sitemap.xml/+server.ts`), so `url` isn't
// always present; fall back to the base locale in that case.
export const load: PageLoad = (event?: Partial<Parameters<PageLoad>[0]>) => {
  const locale = event?.url ? getLocaleForUrl(event.url) : baseLocale;
  return {
    metadata: {
      description: m.data_page_description({}, { locale }),
      hideToolbar: true,
      robots: "noindex, follow",
      title: m.data_title({}, { locale }),
    },
  };
};
