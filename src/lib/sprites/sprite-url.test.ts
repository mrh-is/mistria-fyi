import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("sprite URL resolver", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the production R2 origin", async () => {
    const { itemSpriteUrl, villagerSpriteUrl } = await import("./sprite-url.js");
    expect(itemSpriteUrl("apple")).toBe("https://assets.mistria.fyi/sprites/items/apple.webp?g=1");
    expect(villagerSpriteUrl("adeline")).toBe(
      "https://assets.mistria.fyi/sprites/villagers/adeline.webp?g=1",
    );
  });

  it("honors a PUBLIC_ASSET_ORIGIN override", async () => {
    vi.stubEnv("PUBLIC_ASSET_ORIGIN", "http://localhost:5173/assets");
    const { itemSpriteUrl } = await import("./sprite-url.js");
    expect(itemSpriteUrl("apple")).toBe(
      "http://localhost:5173/assets/sprites/items/apple.webp?g=1",
    );
  });

  it("keys the path on the entity ID, not the game version", async () => {
    const { itemSpriteUrl } = await import("./sprite-url.js");
    expect(itemSpriteUrl("axe")).toBe("https://assets.mistria.fyi/sprites/items/axe.webp?g=1");
  });

  it("appends the generation as a query parameter, leaving the path stable", async () => {
    const { itemSpriteUrl, villagerSpriteUrl } = await import("./sprite-url.js");
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
