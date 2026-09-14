import { redirect } from "@sveltejs/kit";

import { resolve } from "$app/paths";

export function load({ url }: { url: URL }): never {
  redirect(308, `${resolve("/data")}${url.search}`);
}
