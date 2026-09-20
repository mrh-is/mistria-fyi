import { describe, expect, it, vi } from "vitest";

import {
  cacheRuntimeResponse,
  fetchRuntimeRequest,
  isEligibleForRuntimeCaching,
  isExternalFontAsset,
  isExternalSpriteAsset,
  isLazyAsset,
  MAX_SPRITE_ENTRIES,
} from "../service-worker-cache";

const ORIGIN = "https://mistria.fyi";

class MemoryCache {
  readonly entries = new Map<string, Response>();

  delete(request: RequestInfo | URL): Promise<boolean> {
    return Promise.resolve(this.entries.delete(requestUrl(request)));
  }

  keys(): Promise<Request[]> {
    return Promise.resolve([...this.entries.keys()].map((url) => new Request(url)));
  }

  match(request: RequestInfo | URL): Promise<Response | undefined> {
    return Promise.resolve(this.entries.get(requestUrl(request))?.clone());
  }

  put(request: RequestInfo | URL, response: Response): Promise<void> {
    this.entries.set(requestUrl(request), response.clone());
    return Promise.resolve();
  }
}

function dependencies(cache: MemoryCache, fetcher: (request: Request) => Promise<Response>) {
  return {
    assetPaths: ["/favicon.png"],
    cache,
    fetcher,
    matchCache: (request: RequestInfo | URL) => cache.match(request),
  };
}

function requestUrl(request: RequestInfo | URL): string {
  if (request instanceof Request) return request.url;
  return new URL(request.toString(), ORIGIN).href;
}

describe("service-worker runtime cache eligibility", () => {
  it("accepts same-origin non-API requests and approved external assets", () => {
    expect(isEligibleForRuntimeCaching(new URL("/animals", ORIGIN), ORIGIN)).toBe(true);
    expect(isEligibleForRuntimeCaching(new URL("/apikeys", ORIGIN), ORIGIN)).toBe(true);
    expect(isEligibleForRuntimeCaching(new URL("/api/feedback", ORIGIN), ORIGIN)).toBe(false);
    expect(isEligibleForRuntimeCaching(new URL("https://cdn.example.com/app.js"), ORIGIN)).toBe(
      false,
    );
    expect(
      isEligibleForRuntimeCaching(
        new URL("https://assets.mistria.fyi/fonts/satoshi-regular.woff2"),
        ORIGIN,
      ),
    ).toBe(true);
  });
});

describe("service-worker runtime request path", () => {
  it("caches a successful network response", async () => {
    const cache = new MemoryCache();
    const request = new Request(`${ORIGIN}/animals`);

    const response = await fetchRuntimeRequest(
      request,
      dependencies(cache, vi.fn().mockResolvedValue(new Response("fresh", { status: 200 }))),
    );

    expect(await response.text()).toBe("fresh");
    expect(await (await cache.match(request))?.text()).toBe("fresh");
  });

  it.each([404, 500])("does not cache a %i response", async (status) => {
    const cache = new MemoryCache();
    const request = new Request(`${ORIGIN}/animals`);

    const response = await fetchRuntimeRequest(
      request,
      dependencies(cache, vi.fn().mockResolvedValue(new Response("bad", { status }))),
    );

    expect(response.status).toBe(status);
    expect(await cache.match(request)).toBeUndefined();
  });

  it("preserves the last healthy response after a failed refresh", async () => {
    const cache = new MemoryCache();
    const request = new Request(`${ORIGIN}/animals`);
    await cache.put(request, new Response("healthy"));

    await fetchRuntimeRequest(
      request,
      dependencies(cache, vi.fn().mockResolvedValue(new Response("failure", { status: 500 }))),
    );

    expect(await (await cache.match(request))?.text()).toBe("healthy");
  });

  it("returns the cached request when the network is offline", async () => {
    const cache = new MemoryCache();
    const request = new Request(`${ORIGIN}/animals`);
    await cache.put(request, new Response("cached"));

    const response = await fetchRuntimeRequest(
      request,
      dependencies(cache, vi.fn().mockRejectedValue(new Error("offline"))),
    );

    expect(await response.text()).toBe("cached");
  });

  it("returns the offline page for an uncached navigation", async () => {
    const cache = new MemoryCache();
    await cache.put(`${ORIGIN}/offline.html`, new Response("offline page"));
    const request = new Request(`${ORIGIN}/missing`);
    Object.defineProperty(request, "mode", { value: "navigate" });

    const response = await fetchRuntimeRequest(
      request,
      dependencies(cache, vi.fn().mockRejectedValue(new Error("offline"))),
    );

    expect(await response.text()).toBe("offline page");
  });
});

describe("service-worker eviction path", () => {
  it("evicts the oldest runtime entries through the cache update helper", async () => {
    const cache = new MemoryCache();
    await cache.put(`${ORIGIN}/favicon.png`, new Response("asset"));
    for (let index = 0; index < 50; index++) {
      await cache.put(`${ORIGIN}/page-${String(index)}`, new Response(String(index)));
    }

    await cacheRuntimeResponse(
      cache,
      new Request(`${ORIGIN}/newest`),
      new Response("new"),
      ["/favicon.png"],
      50,
    );

    expect(await cache.match(`${ORIGIN}/page-0`)).toBeUndefined();
    expect(await (await cache.match(`${ORIGIN}/newest`))?.text()).toBe("new");
    expect(cache.entries.size).toBe(51);
  });
});

describe("service-worker font asset handling", () => {
  it("treats every versioned R2 font chunk as an approved external asset", () => {
    const chunk = new URL(
      "https://assets.mistria.fyi/fonts/shippori-mincho-5.3.0/shippori-mincho-12-400-normal.woff2",
    );
    expect(isExternalFontAsset(chunk)).toBe(true);
    expect(isEligibleForRuntimeCaching(chunk, ORIGIN)).toBe(true);
    expect(isExternalFontAsset(new URL("https://assets.mistria.fyi/images/x.png"))).toBe(false);
  });

  it("exempts font chunks from LRU eviction", async () => {
    const cache = new MemoryCache();
    const font = new Request("https://assets.mistria.fyi/fonts/lora-5.3.0/lora-cyrillic-400.woff2");
    await cacheRuntimeResponse(cache, font, new Response("font"), [], 1);
    await cacheRuntimeResponse(cache, new Request(`${ORIGIN}/animals`), new Response("a"), [], 1);
    await cacheRuntimeResponse(cache, new Request(`${ORIGIN}/fish`), new Response("b"), [], 1);

    expect(await cache.match(font)).toBeDefined();
    expect(await cache.match(new Request(`${ORIGIN}/animals`))).toBeUndefined();
    expect(await cache.match(new Request(`${ORIGIN}/fish`))).toBeDefined();
  });

  it("marks per-locale font stylesheets as lazy build assets", () => {
    expect(isLazyAsset("/_app/immutable/assets/locale-fonts-ja.C1a2b3.css")).toBe(true);
    expect(isLazyAsset("/_app/immutable/assets/locale-fonts-zh-Hans.C1a2b3.css")).toBe(true);
    expect(isLazyAsset("/_app/immutable/assets/0.C1a2b3.css")).toBe(false);
    expect(isLazyAsset("/fonts/petrona-latin.woff2")).toBe(false);
  });
});

describe("service-worker sprite asset handling", () => {
  it("treats versioned item and villager sprites as external sprite assets", () => {
    const item = new URL("https://assets.mistria.fyi/sprites/1.2.3/spr_ui_item_apple.webp");
    const villager = new URL(
      "https://assets.mistria.fyi/villager-sprites/1.2.3/spr_villager_adeline_small.webp",
    );
    expect(isExternalSpriteAsset(item)).toBe(true);
    expect(isExternalSpriteAsset(villager)).toBe(true);
    expect(isExternalSpriteAsset(new URL("https://assets.mistria.fyi/fonts/satoshi.woff2"))).toBe(
      false,
    );
  });

  it("caches a sprite on first fetch", async () => {
    const cache = new MemoryCache();
    const sprite = new Request("https://assets.mistria.fyi/sprites/1.2.3/spr_ui_item_apple.webp");

    const response = await fetchRuntimeRequest(sprite, {
      assetPaths: [],
      cache,
      fetcher: vi.fn().mockResolvedValue(new Response("sprite", { status: 200 })),
      matchCache: (request) => cache.match(request),
    });

    expect(await response.text()).toBe("sprite");
    expect(await (await cache.match(sprite))?.text()).toBe("sprite");
  });

  it("does not cache an opaque no-cors response (crossorigin is required on every sprite img/image)", async () => {
    const cache = new MemoryCache();
    const sprite = new Request("https://assets.mistria.fyi/sprites/1.2.3/spr_ui_item_opaque.webp");

    // An <img>/<image> fetched without crossorigin="anonymous" yields an opaque response here:
    // status 0, ok false. Response.error() models the same "not ok" shape fetchRuntimeRequest
    // gates on; a real opaque Response can't be constructed directly in this test environment.
    const response = await fetchRuntimeRequest(sprite, {
      assetPaths: [],
      cache,
      fetcher: vi.fn().mockResolvedValue(Response.error()),
      matchCache: (request) => cache.match(request),
    });

    expect(response.ok).toBe(false);
    expect(await cache.match(sprite)).toBeUndefined();
  });

  it("evicts the oldest sprite once the 400-entry cap is exceeded", async () => {
    const cache = new MemoryCache();
    for (let index = 0; index < MAX_SPRITE_ENTRIES; index++) {
      await cache.put(
        `https://assets.mistria.fyi/sprites/1.2.3/spr_${String(index)}.webp`,
        new Response(String(index)),
      );
    }

    await cacheRuntimeResponse(
      cache,
      new Request("https://assets.mistria.fyi/sprites/1.2.3/spr_newest.webp"),
      new Response("newest"),
      [],
      MAX_SPRITE_ENTRIES,
    );

    expect(
      await cache.match("https://assets.mistria.fyi/sprites/1.2.3/spr_0.webp"),
    ).toBeUndefined();
    expect(cache.entries.size).toBe(MAX_SPRITE_ENTRIES);
  });

  it("does not count font chunks toward the sprite cache's own eviction, and vice versa", async () => {
    const spriteCache = new MemoryCache();
    const fontCache = new MemoryCache();

    await cacheRuntimeResponse(
      fontCache,
      new Request("https://assets.mistria.fyi/fonts/satoshi.woff2"),
      new Response("font"),
      [],
      1,
    );
    await cacheRuntimeResponse(
      spriteCache,
      new Request("https://assets.mistria.fyi/sprites/1.2.3/spr_a.webp"),
      new Response("a"),
      [],
      1,
    );
    await cacheRuntimeResponse(
      spriteCache,
      new Request("https://assets.mistria.fyi/sprites/1.2.3/spr_b.webp"),
      new Response("b"),
      [],
      1,
    );

    expect(await fontCache.match("https://assets.mistria.fyi/fonts/satoshi.woff2")).toBeDefined();
    expect(
      await spriteCache.match("https://assets.mistria.fyi/sprites/1.2.3/spr_a.webp"),
    ).toBeUndefined();
    expect(
      await spriteCache.match("https://assets.mistria.fyi/sprites/1.2.3/spr_b.webp"),
    ).toBeDefined();
  });

  it("returns a previously cached sprite when offline", async () => {
    const cache = new MemoryCache();
    const sprite = new Request("https://assets.mistria.fyi/sprites/1.2.3/spr_ui_item_apple.webp");
    await cache.put(sprite, new Response("cached sprite"));

    const response = await fetchRuntimeRequest(sprite, {
      assetPaths: [],
      cache,
      fetcher: vi.fn().mockRejectedValue(new Error("offline")),
      matchCache: (request) => cache.match(request),
    });

    expect(await response.text()).toBe("cached sprite");
  });

  it("falls through to an error response, not the offline page, for a never-loaded sprite", async () => {
    const cache = new MemoryCache();
    const sprite = new Request("https://assets.mistria.fyi/sprites/1.2.3/spr_ui_item_never.webp");

    const response = await fetchRuntimeRequest(sprite, {
      assetPaths: [],
      cache,
      fetcher: vi.fn().mockRejectedValue(new Error("network failure")),
      matchCache: (request) => cache.match(request),
    });

    expect(response.type).toBe("error");
  });
});
