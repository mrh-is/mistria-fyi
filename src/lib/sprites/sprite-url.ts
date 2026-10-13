/**
 * The sprite base URL, resolved once at build time by `resolveSpriteAssetBase`: the production R2
 * bucket, or the `PUBLIC_ASSET_ORIGIN` override for local development. `vite.config.ts` defines it
 * so the sprite URLs and the CSP's `img-src` always agree.
 */
declare const __SPRITE_ASSET_BASE__: string;

/**
 * Bump only when an existing sprite's pixels change (not for newly-added sprites). Objects are
 * overwritten in place at a stable, entity-ID-keyed path, so this query parameter is what busts
 * the edge cache and the service worker's cache on a pixel change.
 */
const spriteGeneration = 2;

export function itemSpriteUrl(itemId: string): string {
  return `${__SPRITE_ASSET_BASE__}/sprites/items/${itemId}.webp?g=${String(spriteGeneration)}`;
}

export function villagerSpriteUrl(villagerId: string): string {
  return `${__SPRITE_ASSET_BASE__}/sprites/villagers/${villagerId}.webp?g=${String(spriteGeneration)}`;
}
