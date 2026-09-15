import type { PageLoad } from "./$types.js";

export const load: PageLoad = () => ({
  metadata: {
    description:
      "Track crops, forage, fish, insects, artifacts, and other almanac discoveries in Fields of Mistria.",
    title: "Almanac",
  },
});
