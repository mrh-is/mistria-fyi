import { deLocalizeUrl } from "#lib/paraglide/runtime.js";

import type { Reroute } from "@sveltejs/kit/hooks";

/**
 * SvelteKit matches routes against the de-localized pathname (e.g. `/ja/almanac` → `/almanac`),
 * so every route file stays unprefixed on disk. `hooks.server.ts` restores the locale prefix in
 * the response via `paraglideMiddleware`.
 */
export const reroute: Reroute = ({ url }) => deLocalizeUrl(url).pathname;
