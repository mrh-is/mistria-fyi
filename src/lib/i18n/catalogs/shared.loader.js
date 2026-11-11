import { page } from "$app/state";

import { readSharedRuntime } from "../shared-ui.js";

export { readSharedRuntime as getRuntime } from "../shared-ui.js";

export function getRuntimeRx(locale = import.meta.env.SSR ? undefined : page.data.locale) {
  return readSharedRuntime(locale);
}
