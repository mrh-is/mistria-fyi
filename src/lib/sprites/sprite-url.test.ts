import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/data/index.js", () => ({ trackerData: { version: "1.2.3" } }));

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
    expect(itemSpriteUrl("spr_apple")).toBe(
      "https://assets.mistria.fyi/sprites/1.2.3/spr_apple.webp",
    );
    expect(villagerSpriteUrl("spr_villager_adeline_small")).toBe(
      "https://assets.mistria.fyi/villager-sprites/1.2.3/spr_villager_adeline_small.webp",
    );
  });

  it("honors a PUBLIC_ASSET_ORIGIN override", async () => {
    vi.stubEnv("PUBLIC_ASSET_ORIGIN", "http://localhost:5173/assets");
    const { itemSpriteUrl } = await import("./sprite-url.js");
    expect(itemSpriteUrl("spr_apple")).toBe(
      "http://localhost:5173/assets/sprites/1.2.3/spr_apple.webp",
    );
  });

  it("prefixes the path with the game version from tracker data", async () => {
    const { itemSpriteUrl } = await import("./sprite-url.js");
    expect(itemSpriteUrl("spr_axe")).toContain("/sprites/1.2.3/spr_axe.webp");
  });
});
