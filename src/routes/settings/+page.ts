import { redirect } from "@sveltejs/kit";

import { localizedHref } from "#lib/utils/localized-href.js";

export function load({ url }: { url: URL }): never {
  redirect(308, `${localizedHref("data")}${url.search}`);
}
