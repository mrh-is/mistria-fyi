import { pageMetadata } from "#lib/data/page-metadata.js";

import type { RobotsDirective } from "#lib/data/page-metadata.js";

import type { PageLoad } from "./$types";

export const _robots: RobotsDirective = "noindex, nofollow";

export const load: PageLoad = () => ({
  metadata: pageMetadata({
    description: "Review icons during Mistria Field Guide development.",
    robots: _robots,
    title: "Icons",
  }),
});
