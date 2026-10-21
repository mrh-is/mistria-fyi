import { error } from "@sveltejs/kit";

import { dev } from "$app/env";

import type { LayoutLoad } from "./$types";

// Production builds don't ship these pages, so there is nothing to prerender.
export const prerender = false;

/** Development-only tooling pages (fonts, icons, share card) don't exist in production builds. */
export const load: LayoutLoad = () => {
  if (!dev) error(404, "Not found");
};
