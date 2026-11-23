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

/**
 * Each entity kind's directory under `sprites/`, so kinds can't shadow one another. An entity ID
 * may hold a slash (`alpaca/white`), which nests its object one level deeper.
 */
export const SPRITE_KINDS = [
  "animal-cosmetics",
  "animal-variants",
  "cosmetics",
  "items",
  "mount-appearances",
  "mount-perks",
  "pet-cosmetics",
  "pet-skins",
  "spells",
  "villagers",
] as const;

export type SpriteKind = (typeof SPRITE_KINDS)[number];

/** One sprite: the entity kind's directory & the entity's own ID. */
export interface SpriteRef {
  id: string;
  kind: SpriteKind;
}

export function spriteUrl({ id, kind }: SpriteRef): string {
  return `${__SPRITE_ASSET_BASE__}/sprites/${kind}/${id}.webp?g=${String(spriteGeneration)}`;
}

export function itemSprite(itemId: string): SpriteRef {
  return { id: itemId, kind: "items" };
}

export function itemSpriteUrl(itemId: string): string {
  return spriteUrl(itemSprite(itemId));
}

export function villagerSpriteUrl(villagerId: string): string {
  return spriteUrl({ id: villagerId, kind: "villagers" });
}
