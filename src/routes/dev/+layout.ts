import { error } from "@sveltejs/kit";

import { dev } from "$app/environment";

import type { LayoutLoad } from "./$types";

/** Development-only tooling pages (fonts, icons, share card) don't exist in production builds. */
export const load: LayoutLoad = () => {
  if (!dev) error(404, "Not found");
};
