import { pageMetadata } from "$lib/data/page-metadata.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = () => ({
  metadata: pageMetadata({
    description: "Review per-locale font stacks during Mistria Field Guide development.",
    robots: "noindex, nofollow",
    title: "Fonts",
  }),
});
