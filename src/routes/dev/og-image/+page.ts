import { pageMetadata } from "$lib/data/page-metadata";

import type { RobotsDirective } from "$lib/data/page-metadata";

import type { PageLoad } from "./$types";

export const _robots: RobotsDirective = "noindex, nofollow";

export const load: PageLoad = () => ({
  metadata: pageMetadata({
    description: "Generate the Mistria Field Guide share card during development.",
    robots: _robots,
    title: "Share card",
    toolbar: "hidden",
  }),
});
