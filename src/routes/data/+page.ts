import type { PageLoad } from "./$types.js";

export const load: PageLoad = () => ({
  metadata: {
    description:
      "Import, transfer, back up, restore, or reset your Mistria Field Guide tracking progress.",
    hideToolbar: true,
    robots: "noindex, follow",
    title: "Data management",
  },
});
