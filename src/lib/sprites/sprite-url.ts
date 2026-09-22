/** Production R2 bucket; overridable via `PUBLIC_ASSET_ORIGIN` for local development. */
const DEFAULT_ASSET_ORIGIN = "https://assets.mistria.fyi";

/**
 * Bump only when an existing sprite's pixels change (not for newly-added sprites). Objects are
 * overwritten in place at a stable, entity-ID-keyed path, so this query parameter is what busts
 * the edge cache and the service worker's cache on a pixel change.
 */
const spriteGeneration = 1;

export function itemSpriteUrl(itemId: string): string {
  return `${assetOrigin()}/sprites/items/${itemId}.webp?g=${String(spriteGeneration)}`;
}

export function villagerSpriteUrl(villagerId: string): string {
  return `${assetOrigin()}/sprites/villagers/${villagerId}.webp?g=${String(spriteGeneration)}`;
}

function assetOrigin(): string {
  return import.meta.env.PUBLIC_ASSET_ORIGIN ?? DEFAULT_ASSET_ORIGIN;
}
