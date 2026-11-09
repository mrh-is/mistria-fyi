import { prepareUi } from "#fixture-ui";

import { loadNames } from "#lib/data/names.js";
import { browser } from "$app/env";

import { resolveLocale } from "../../locale.js";

/** @param {{ params: { locale: string }, route: { id: string | null } }} event */
export async function load({ params, route }) {
  const locale = resolveLocale(params.locale);
  const feature = route.id === "/[locale]/settings" ? "settings" : "search";
  const prepare = /** @type {(locale: string, file: string) => Promise<() => void> | void} */ (
    prepareUi
  );
  const [, activateUi] = await Promise.all([
    loadNames(locale, ["ui"]),
    browser ? prepare(locale, `src/features/${feature}/panel.svelte`) : undefined,
  ]);
  return { activateUi, locale };
}
