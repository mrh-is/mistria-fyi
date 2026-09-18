import { loadPageNames, LOCALIZED_CATEGORIES } from "$lib/data/names.js";

import type { PageLoad } from "./$types";

// The everything checklist renders every category, so it needs every name chunk.
export const load: PageLoad = async (event?: Partial<Parameters<PageLoad>[0]>) => {
  await loadPageNames(event, LOCALIZED_CATEGORIES);
  return {
    metadata: {
      description: "View & track every Fields of Mistria completion category in one checklist.",
      title: "Checklist of everything",
    },
  };
};
