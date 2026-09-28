import { LOCALIZED_CATEGORIES } from "$lib/data/names";
import { localizedPageLoad } from "$lib/data/page-load";

import type { PageLoad } from "./$types";

// The everything checklist renders every category, so it needs every name chunk.
export const load: PageLoad = localizedPageLoad(LOCALIZED_CATEGORIES, () => ({
  description: "View & track every Fields of Mistria completion category in one checklist.",
  title: "Checklist of everything",
  toolbar: { worldState: true },
}));
