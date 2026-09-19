import { pageMetadata } from "$lib/data/page-metadata.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = () => ({
  metadata: pageMetadata({
    description: "Review icons during Mistria Field Guide development.",
    robots: "noindex, nofollow",
    title: "Icons",
  }),
});
