import type { PageLoad } from "./$types.js";

export const load: PageLoad = () => ({
  metadata: {
    description:
      "Track crops, forage, fish, insects, artifacts, & other almanac entries in Fields of Mistria.",
    title: "Almanac",
  },
});
