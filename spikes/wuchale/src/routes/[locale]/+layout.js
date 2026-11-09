import { loadUi } from "#fixture-ui";

import { loadNames } from "#lib/data/names.js";
import { browser } from "$app/env";

import { resolveLocale } from "../../locale.js";

/** @param {{ params: { locale: string } }} event */
export async function load({ params }) {
  const locale = resolveLocale(params.locale);
  const loadMessages = /** @type {(locale: string) => Promise<void> | void} */ (loadUi);
  await Promise.all([loadNames(locale, ["ui"]), browser && loadMessages(locale)]);
  return { locale };
}
