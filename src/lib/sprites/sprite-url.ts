import { trackerData } from "$lib/data/index.js";

/** Production R2 bucket; overridable via `PUBLIC_ASSET_ORIGIN` for local development. */
const DEFAULT_ASSET_ORIGIN = "https://assets.mistria.fyi";

/**
 * Sprites are hosted under a game-version prefix so objects are immutable and cacheable forever;
 * a version bump changes the URL instead of the object's contents.
 */
export function itemSpriteUrl(name: string): string {
  return `${assetOrigin()}/sprites/${trackerData.version}/${name}.webp`;
}

export function villagerSpriteUrl(name: string): string {
  return `${assetOrigin()}/villager-sprites/${trackerData.version}/${name}.webp`;
}

function assetOrigin(): string {
  return import.meta.env.PUBLIC_ASSET_ORIGIN ?? DEFAULT_ASSET_ORIGIN;
}
