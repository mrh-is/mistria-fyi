import toRuntime from "wuchale/runtime";

import { loadCatalog, patterns } from "./.wuchale/ui.proxy.js";

const empty = toRuntime();
/** @type {{ id: number, runtime: import("wuchale/runtime").Runtime } | undefined} */
// oxlint-disable-next-line eslint/no-undef -- Svelte injects the rune when it compiles this module.
let active = $state.raw();

export const getRuntime = (id = 0) => (active?.id === id ? active.runtime : empty);
export const getRuntimeRx = (id = 0) => getRuntime(id);

/** @param {string} locale @param {string} sourceFile */
export async function prepareUi(locale, sourceFile) {
  const id = patterns.indexOf(sourceFile);
  if (id < 1) throw new Error(`No catalog group for ${sourceFile}`);
  const snapshot = { id, runtime: toRuntime(await loadCatalog(id, locale), locale) };
  // The navigation owns this snapshot. Preloads and out-of-order fetches cannot mutate it.
  return () => {
    active = snapshot;
  };
}
