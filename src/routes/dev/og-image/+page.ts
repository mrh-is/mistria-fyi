import { pageMetadata } from "$lib/data/page-metadata.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = () => ({
  metadata: pageMetadata({
    description: "Generate the Mistria Field Guide share card during development.",
    robots: "noindex, nofollow",
    title: "Share card",
    toolbar: "hidden",
  }),
});
