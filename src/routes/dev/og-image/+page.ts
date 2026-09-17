import type { PageLoad } from "./$types.js";

export const load: PageLoad = () => ({
  metadata: {
    description: "Generate the Mistria Field Guide share card during development.",
    hideToolbar: true,
    robots: "noindex, nofollow",
    title: "Share card",
  },
});
