import toRuntime from "wuchale/runtime";

import { pageMetadata } from "#lib/data/page-metadata.js";
import { loadAboutCatalog } from "#lib/i18n/about-ui.js";

import { aboutMetadata } from "./about-metadata.js";

import type { PageLoad } from "./$types";

export const load: PageLoad = async (event) => {
  const { locale } = await event.parent();
  const aboutCatalog = await loadAboutCatalog(locale);
  const metadata = pageMetadata({
    ...aboutMetadata(toRuntime(aboutCatalog, locale)),
    toolbar: "hidden",
  });
  return { aboutCatalog, metadata };
};
