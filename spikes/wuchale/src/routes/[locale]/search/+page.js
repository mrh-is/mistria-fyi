import { getName } from "#lib/data/names.js";

/** @param {{ parent: () => Promise<{ locale: import("#lib/types/locale.js").LocaleCode }>, url: URL }} event */
export async function load({ parent, url }) {
  const { locale } = await parent();
  return {
    count: Number(url.searchParams.get("count") ?? 1),
    gameName: getName("ui", "fish", locale),
    locale,
    query: url.searchParams.get("q") ?? "tea",
    showError: url.searchParams.has("error"),
  };
}
