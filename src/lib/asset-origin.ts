/**
 * The R2 bucket that serves sprites and self-hosted fonts. TypeScript reads it from here; CSS and
 * the upload scripts can't import it, so `asset-origin.test.ts` holds their copies to this value.
 */
export const PRODUCTION_ASSET_ORIGIN = "https://assets.mistria.fyi";

/**
 * Resolves the base URL sprites load from. `vite.config.ts` calls this once at build time with
 * the optional `PUBLIC_ASSET_ORIGIN` override, then feeds the result to both the sprite URLs and
 * the CSP, so an override can never point sprites at an origin the CSP blocks.
 *
 * The override may carry a path (a local file server rooted at `pipeline/output/`, say), but not a
 * query or fragment, since sprite paths are appended to it.
 */
export function resolveSpriteAssetBase(override: string | undefined): string {
  const trimmed = override?.trim();
  if (trimmed === undefined || trimmed === "") {
    return PRODUCTION_ASSET_ORIGIN;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`PUBLIC_ASSET_ORIGIN must be an absolute URL; got "${trimmed}".`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`PUBLIC_ASSET_ORIGIN must use http or https; got "${trimmed}".`);
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error(`PUBLIC_ASSET_ORIGIN must not include a query or fragment; got "${trimmed}".`);
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
}
