import { redirect } from "@sveltejs/kit";

import { resolve } from "$app/paths";
import { localizeHref } from "$lib/paraglide/runtime.js";

export function load({ url }: { url: URL }): never {
  redirect(308, `${localizeHref(resolve("/data"))}${url.search}`);
}
