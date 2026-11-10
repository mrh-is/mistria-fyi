import { localizedPageLoad } from "#lib/data/page-load.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = localizedPageLoad([], (_locale) => ({
  description:
    "Read how the Mistria Field Guide stores your Fields of Mistria progress, handles feedback, and protects your privacy.",
  title: "Privacy policy",
  toolbar: "hidden",
}));
