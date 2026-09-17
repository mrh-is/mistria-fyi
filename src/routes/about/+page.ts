import type { PageLoad } from "./$types.js";

export const load: PageLoad = () => ({
  metadata: {
    description: "Learn about the unofficial Mistria Field Guide for Fields of Mistria.",
    hideToolbar: true,
    title: "About",
  },
});
