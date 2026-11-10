import { localizedPageLoad } from "#lib/data/page-load.js";

import type { RobotsDirective } from "#lib/data/page-metadata.js";

import type { PageLoad } from "./$types";

export const _robots: RobotsDirective = "noindex, follow";

// The merge summary's household-conflict messages name villagers by their localized display name.
export const load: PageLoad = localizedPageLoad(["villagers"], (_locale) => ({
  description:
    "Import, sync, back up, restore, or reset your Mistria Field Guide tracking progress.",
  robots: _robots,
  title: "Data management",
  toolbar: "hidden",
}));
