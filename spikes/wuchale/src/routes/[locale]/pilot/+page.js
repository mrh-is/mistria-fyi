import { getName } from "#lib/data/names.js";

import { locales } from "../../../locale.js";

export const prerender = true;
export const entries = () => locales.map((locale) => ({ locale }));

/** @param {{ parent: () => Promise<{ locale: import("#lib/types/locale.js").LocaleCode }> }} event */
export async function load({ parent }) {
  const { locale } = await parent();
  return { gameName: getName("ui", "fish", locale), locale };
}
