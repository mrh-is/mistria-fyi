import { describe, expect, it } from "vitest";

import { localeNameChunks } from "./locale-name-chunks.js";

import type { Manifest } from "vite";

describe("localeNameChunks", () => {
  it("groups emitted name chunks by the locale of their source module", () => {
    const manifest: Manifest = {
      ".svelte-kit/generated/client-optimized/app.js": { file: "_app/immutable/entry/app.A.js" },
      "src/lib/data/locales/en/items.json": { file: "_app/immutable/chunks/Zz9.js" },
      "src/lib/data/locales/en/pets/skins.json": { file: "_app/immutable/chunks/Aa1.js" },
      "src/lib/data/locales/zh-Hans/items.json": { file: "_app/immutable/chunks/Mm5.js" },
    };

    expect(localeNameChunks(manifest)).toEqual({
      en: ["/_app/immutable/chunks/Aa1.js", "/_app/immutable/chunks/Zz9.js"],
      "zh-Hans": ["/_app/immutable/chunks/Mm5.js"],
    });
  });

  it("ignores modules outside the locale name tree", () => {
    const manifest: Manifest = {
      "src/lib/data/locales.json": { file: "_app/immutable/chunks/L.js" },
      "src/lib/data/tracker-data.json": { file: "_app/immutable/chunks/T.js" },
    };

    expect(localeNameChunks(manifest)).toEqual({});
  });
});
