import { describe, expect, it } from "vitest";

import { itemSpriteUrl, villagerSpriteUrl } from "./sprite-url.js";

// `PUBLIC_ASSET_ORIGIN` overrides are covered by `resolveSpriteAssetBase` in asset-origin.test.ts;
// these run against the build-time default.
describe("sprite URL resolver", () => {
  it("defaults to the production R2 origin", () => {
    expect(itemSpriteUrl("apple")).toBe("https://assets.mistria.fyi/sprites/items/apple.webp?g=1");
    expect(villagerSpriteUrl("adeline")).toBe(
      "https://assets.mistria.fyi/sprites/villagers/adeline.webp?g=1",
    );
  });

  it("keys the path on the entity ID, not the game version", () => {
    expect(itemSpriteUrl("axe")).toBe("https://assets.mistria.fyi/sprites/items/axe.webp?g=1");
  });

  it("appends the generation as a query parameter, leaving the path stable", () => {
    // The generation only ever changes the `?g=` query string, never the path itself — a bump
    // busts the edge/service-worker cache without moving the object or re-uploading it.
    expect(itemSpriteUrl("axe")).toMatch(
      /^https:\/\/assets\.mistria\.fyi\/sprites\/items\/axe\.webp\?g=\d+$/,
    );
    expect(villagerSpriteUrl("adeline")).toMatch(
      /^https:\/\/assets\.mistria\.fyi\/sprites\/villagers\/adeline\.webp\?g=\d+$/,
    );
  });
});
