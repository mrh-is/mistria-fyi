import { stripLocale } from "#lib/i18n/locale-path.js";

import type { Reroute } from "@sveltejs/kit/hooks";

/**
 * SvelteKit matches routes against the de-localized pathname (e.g. `/ja/almanac` → `/almanac`),
 * so every route file stays unprefixed on disk. The public URL retains its locale prefix.
 */
export const reroute: Reroute = ({ url }) => stripLocale(url.pathname);
