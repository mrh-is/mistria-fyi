import { getLocaleForUrl } from "$lib/paraglide/runtime.js";

import type { LayoutLoad } from "./$types.js";

/**
 * Resolves the route's locale once, at the top of the tree, so every page and component can source
 * it from `load()` data rather than ambient state. `getLocaleForUrl` is route-aware, which matters
 * because `hooks.ts` de-localizes the URL before SvelteKit matches routes — there is no `[locale]`
 * segment on disk to read.
 */
export const load: LayoutLoad = ({ url }) => ({ locale: getLocaleForUrl(url) });
