import { PRODUCTION_ASSET_ORIGIN } from "../asset-origin.js";
import { APP_HTML_SCRIPT_HASHES } from "./inline-scripts.js";

import type { Config } from "@sveltejs/kit/vite";

import type { CspScriptHash } from "./inline-scripts.js";

export type CspDirectives = NonNullable<NonNullable<Config["csp"]>["directives"]>;
type CspSource = NonNullable<CspDirectives["img-src"]>[number];

/**
 * The origin of a validated base URL, as a CSP host source. SvelteKit's template-literal source
 * type can't follow a value only known at runtime, hence the assertion.
 */
function originSource(base: string): CspSource {
  return new URL(base).origin as CspSource;
}

/**
 * The one Content-Security-Policy source. `vite.config.ts` hands it to the `sveltekit()` plugin,
 * which emits it (plus a per-response script nonce) on rendered pages, and renders it into the
 * generated `_headers` file that covers static files.
 *
 * `spriteAssetBase` is the build's resolved sprite base URL (see `resolveSpriteAssetBase`); fonts
 * always come from the production bucket. `connect-src` lists both origins because the service
 * worker fetches fonts & sprites with `fetch()`, which `font-src` & `img-src` don't cover.
 *
 * `scriptHashes` allows inline scripts by hash: `app.html`'s bootstraps everywhere, plus a
 * prerendered page's own SvelteKit start script in that page's `_headers` rule. SvelteKit adds a
 * nonce or hash for its start script itself; it never hashes the template's scripts.
 */
export function cspDirectives(
  spriteAssetBase: string = PRODUCTION_ASSET_ORIGIN,
  scriptHashes: readonly CspScriptHash[] = APP_HTML_SCRIPT_HASHES,
): CspDirectives {
  const spriteOrigin = originSource(spriteAssetBase);
  return {
    "base-uri": ["self"],
    "connect-src": [
      ...new Set<CspSource>([
        "self",
        "https://challenges.cloudflare.com",
        PRODUCTION_ASSET_ORIGIN,
        spriteOrigin,
      ]),
    ],
    "default-src": ["none"],
    "font-src": ["self", PRODUCTION_ASSET_ORIGIN],
    "form-action": ["self"],
    "frame-ancestors": ["none"],
    "frame-src": ["https://challenges.cloudflare.com"],
    "img-src": ["self", "data:", "blob:", spriteOrigin],
    "manifest-src": ["self"],
    "object-src": ["none"],
    "script-src": [
      ...new Set<CspSource>(["self", ...scriptHashes, "https://challenges.cloudflare.com"]),
    ],
    "style-src": ["self", "unsafe-inline"],
    "worker-src": ["self", "blob:"],
  };
}

/** The production policy, with sprites on the production bucket & `app.html`'s script hashes. */
export const CSP_DIRECTIVES = cspDirectives();
