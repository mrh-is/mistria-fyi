import type { PageLoad } from "./$types.js";

export const load: PageLoad = () => ({
  metadata: {
    description: "Track every museum collection and donation in Fields of Mistria.",
    title: "Museum",
  },
});
