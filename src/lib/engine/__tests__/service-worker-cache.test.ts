import { describe, expect, it, vi } from "vitest";

import {
  CACHE_LOCALES_MESSAGE,
  cacheLocaleChunks,
  cacheLocalesRequest,
  cacheRuntimeResponse,
  cacheSpriteResponse,
  fetchRuntimeRequest,
  fetchSpriteRequest,
  isEligibleForRuntimeCaching,
  isExternalFontAsset,
  isExternalSpriteAsset,
  isLazyAsset,
  isSkipWaitingRequest,
  MAX_SPRITE_ENTRIES,
  readOfflineLocales,
  rememberOfflineLocales,
  SKIP_WAITING_MESSAGE,
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

/** Runtime dependencies whose deferred cache writes a test can await with `settled()`. */
function dependencies(cache: MemoryCache, fetcher: (request: Request) => Promise<Response>) {
  const pending: Promise<unknown>[] = [];
  return {
    assetPaths: ["/favicon.png"],
    cache,
    fetcher,
    matchCache: (request: RequestInfo | URL) => cache.match(request),
    settled: () => Promise.all(pending),
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
  };
}

function requestUrl(request: RequestInfo | URL): string {
  if (request instanceof Request) return request.url;
  return new URL(request.toString(), ORIGIN).href;
}

/** Sprite dependencies whose deferred cache writes a test can await with `settled()`. */
function spriteDependencies(cache: MemoryCache, fetcher: (request: Request) => Promise<Response>) {
  const pending: Promise<unknown>[] = [];
  return {
    cache,
    fetcher,
    settled: () => Promise.all(pending),
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
  };
}

function spriteUrl(name: string, generation: null | number = 1): string {
  const url = `https://assets.mistria.fyi/sprites/items/${name}.webp`;
  return generation === null ? url : `${url}?g=${String(generation)}`;
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

    const deps = dependencies(
      cache,
      vi.fn().mockResolvedValue(new Response("fresh", { status: 200 })),
    );

    const response = await fetchRuntimeRequest(request, deps);
    await deps.settled();

    expect(await response.text()).toBe("fresh");
    expect(await (await cache.match(request))?.text()).toBe("fresh");
  });

  it("returns the network response when the cache write fails", async () => {
    const cache = new MemoryCache();
    const request = new Request(`${ORIGIN}/animals`);
    Object.defineProperty(request, "mode", { value: "navigate" });
    await cache.put(`${ORIGIN}/offline.html`, new Response("offline page"));
    vi.spyOn(cache, "put").mockRejectedValue(new DOMException("Full", "QuotaExceededError"));
    const deps = dependencies(
      cache,
      vi.fn().mockResolvedValue(new Response("fresh", { status: 200 })),
    );

    const response = await fetchRuntimeRequest(request, deps);
    await deps.settled();

    expect(await response.text()).toBe("fresh");
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
    const noChunks = new Set<string>();
    expect(isLazyAsset("/_app/immutable/assets/locale-fonts-ja.C1a2b3.css", noChunks)).toBe(true);
    expect(isLazyAsset("/_app/immutable/assets/locale-fonts-zh-Hans.C1a2b3.css", noChunks)).toBe(
      true,
    );
    expect(isLazyAsset("/_app/immutable/assets/0.C1a2b3.css", noChunks)).toBe(false);
    expect(isLazyAsset("/fonts/petrona-latin.woff2", noChunks)).toBe(false);
  });
});

describe("service-worker sprite asset handling", () => {
  it("treats item and villager sprites as external sprite assets", () => {
    const item = new URL("https://assets.mistria.fyi/sprites/items/spr_ui_item_apple.webp");
    const villager = new URL("https://assets.mistria.fyi/sprites/villagers/adeline.webp?g=1");
    expect(isExternalSpriteAsset(item)).toBe(true);
    expect(isExternalSpriteAsset(villager)).toBe(true);
    expect(isExternalSpriteAsset(new URL("https://assets.mistria.fyi/fonts/satoshi.woff2"))).toBe(
      false,
    );
  });

  it("serves a cached sprite without a network request", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_apple"));
    await cache.put(sprite, new Response("cached sprite"));
    const fetcher = vi.fn();

    const response = await fetchSpriteRequest(sprite, spriteDependencies(cache, fetcher));

    expect(await response.text()).toBe("cached sprite");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fetches and caches an uncached sprite", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_apple"));
    const dependencies = spriteDependencies(
      cache,
      vi.fn().mockResolvedValue(new Response("sprite", { status: 200 })),
    );

    const response = await fetchSpriteRequest(sprite, dependencies);
    await dependencies.settled();

    expect(await response.text()).toBe("sprite");
    expect(await (await cache.match(sprite))?.text()).toBe("sprite");
  });

  it("does not cache an opaque no-cors response (crossorigin is required on every sprite img/image)", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_opaque"));
    // An <img>/<image> fetched without crossorigin="anonymous" yields an opaque response here:
    // status 0, ok false. Response.error() models the same "not ok" shape fetchSpriteRequest
    // gates on; a real opaque Response can't be constructed directly in this test environment.
    const dependencies = spriteDependencies(cache, vi.fn().mockResolvedValue(Response.error()));

    const response = await fetchSpriteRequest(sprite, dependencies);
    await dependencies.settled();

    expect(response.ok).toBe(false);
    expect(await cache.match(sprite)).toBeUndefined();
  });

  it("does not cache a failed response", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_missing"));
    const dependencies = spriteDependencies(
      cache,
      vi.fn().mockResolvedValue(new Response("not found", { status: 404 })),
    );

    const response = await fetchSpriteRequest(sprite, dependencies);
    await dependencies.settled();

    expect(response.status).toBe(404);
    expect(cache.entries.size).toBe(0);
  });

  it("returns a previously cached sprite when offline", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_apple"));
    await cache.put(sprite, new Response("cached sprite"));

    const response = await fetchSpriteRequest(
      sprite,
      spriteDependencies(cache, vi.fn().mockRejectedValue(new Error("offline"))),
    );

    expect(await response.text()).toBe("cached sprite");
  });

  it("falls through to an error response, not the offline page, for a never-loaded sprite", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_never"));

    const response = await fetchSpriteRequest(
      sprite,
      spriteDependencies(cache, vi.fn().mockRejectedValue(new Error("network failure"))),
    );

    expect(response.type).toBe("error");
    expect(cache.entries.size).toBe(0);
  });

  it("evicts the oldest sprite once the 400-entry cap is exceeded", async () => {
    const cache = new MemoryCache();
    for (let index = 0; index < MAX_SPRITE_ENTRIES; index++) {
      await cache.put(spriteUrl(`spr_${String(index)}`), new Response(String(index)));
    }

    await cacheSpriteResponse(cache, new Request(spriteUrl("spr_newest")), new Response("newest"));

    expect(await cache.match(spriteUrl("spr_0"))).toBeUndefined();
    expect(await cache.match(spriteUrl("spr_newest"))).toBeDefined();
    expect(cache.entries.size).toBe(MAX_SPRITE_ENTRIES);
  });

  it("evicts the least recently used sprite, not the oldest-inserted one", async () => {
    const cache = new MemoryCache();
    await cache.put(spriteUrl("spr_a"), new Response("a"));
    await cache.put(spriteUrl("spr_b"), new Response("b"));
    const dependencies = spriteDependencies(cache, vi.fn());

    await fetchSpriteRequest(new Request(spriteUrl("spr_a")), dependencies);
    await dependencies.settled();
    await cacheSpriteResponse(cache, new Request(spriteUrl("spr_c")), new Response("c"), 2);

    expect(await cache.match(spriteUrl("spr_a"))).toBeDefined();
    expect(await cache.match(spriteUrl("spr_b"))).toBeUndefined();
    expect(await cache.match(spriteUrl("spr_c"))).toBeDefined();
  });

  it("prunes sprites from an older generation when a newer one is cached", async () => {
    const cache = new MemoryCache();
    await cache.put(spriteUrl("spr_a", 1), new Response("a1"));
    await cache.put(spriteUrl("spr_b", 1), new Response("b1"));
    await cache.put(spriteUrl("spr_legacy", null), new Response("legacy"));

    await cacheSpriteResponse(cache, new Request(spriteUrl("spr_a", 2)), new Response("a2"));

    expect([...cache.entries.keys()]).toEqual([spriteUrl("spr_a", 2)]);
  });

  it("never evicts a newer generation to make room for an older one", async () => {
    const cache = new MemoryCache();
    for (let index = 0; index < MAX_SPRITE_ENTRIES; index++) {
      await cache.put(spriteUrl(`spr_${String(index)}`, 2), new Response(String(index)));
    }

    await cacheSpriteResponse(cache, new Request(spriteUrl("spr_old", 1)), new Response("old"));

    expect(await cache.match(spriteUrl("spr_0", 2))).toBeDefined();
    expect(await cache.match(spriteUrl("spr_old", 1))).toBeUndefined();
    expect(cache.entries.size).toBe(MAX_SPRITE_ENTRIES);
  });

  it("evicts the older generation's own least recently used sprite when over the cap", async () => {
    const cache = new MemoryCache();
    await cache.put(spriteUrl("spr_old_a", 1), new Response("a"));
    await cache.put(spriteUrl("spr_new", 2), new Response("new"));

    await cacheSpriteResponse(cache, new Request(spriteUrl("spr_old_b", 1)), new Response("b"), 2);

    expect([...cache.entries.keys()]).toEqual([spriteUrl("spr_new", 2), spriteUrl("spr_old_b", 1)]);
  });

  it("keeps newer-generation sprites when an older tab caches one", async () => {
    const cache = new MemoryCache();
    await cache.put(spriteUrl("spr_a", 2), new Response("a2"));

    await cacheSpriteResponse(cache, new Request(spriteUrl("spr_b", 1)), new Response("b1"));

    expect(await cache.match(spriteUrl("spr_a", 2))).toBeDefined();
    expect(await cache.match(spriteUrl("spr_b", 1))).toBeDefined();
  });
});

describe("service-worker locale name chunks", () => {
  const CHUNKS = {
    en: ["/_app/immutable/chunks/en-a.js", "/_app/immutable/chunks/en-b.js"],
    ja: ["/_app/immutable/chunks/ja-a.js"],
  };

  class LocaleCache extends MemoryCache {
    readonly added: string[] = [];

    constructor(private readonly failing: ReadonlySet<string> = new Set()) {
      super();
    }

    add(request: RequestInfo | URL): Promise<void> {
      const url = requestUrl(request);
      this.added.push(new URL(url).pathname);
      if (this.failing.has(new URL(url).pathname)) {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      this.entries.set(url, new Response("chunk"));
      return Promise.resolve();
    }
  }

  it("marks only the build's locale name chunks as lazy", () => {
    const chunkPaths = new Set(Object.values(CHUNKS).flat());
    expect(isLazyAsset("/_app/immutable/chunks/ja-a.js", chunkPaths)).toBe(true);
    expect(isLazyAsset("/_app/immutable/chunks/shared.js", chunkPaths)).toBe(false);
  });

  it("accepts a cache request for known locales only", () => {
    expect(
      cacheLocalesRequest(
        { type: CACHE_LOCALES_MESSAGE, locales: ["ja", "en", "ja", "xx"] },
        CHUNKS,
      ),
    ).toEqual(["ja", "en"]);
    expect(
      cacheLocalesRequest({ type: CACHE_LOCALES_MESSAGE, locales: ["constructor"] }, CHUNKS),
    ).toEqual([]);
    expect(cacheLocalesRequest({ type: "other", locales: ["ja"] }, CHUNKS)).toBeUndefined();
    expect(cacheLocalesRequest({ type: CACHE_LOCALES_MESSAGE }, CHUNKS)).toBeUndefined();
    expect(cacheLocalesRequest("mfg:cache-locales", CHUNKS)).toBeUndefined();
    expect(cacheLocalesRequest(null, CHUNKS)).toBeUndefined();
  });

  it("caches every chunk of the requested locales and nothing else", async () => {
    const cache = new LocaleCache();

    expect(await cacheLocaleChunks(cache, ["en"], CHUNKS)).toEqual([]);

    expect(cache.added).toEqual(CHUNKS.en);
    expect(await cache.match(`${ORIGIN}/_app/immutable/chunks/ja-a.js`)).toBeUndefined();
  });

  it("skips chunks that are already cached", async () => {
    const cache = new LocaleCache();
    await cache.put(`${ORIGIN}/_app/immutable/chunks/en-a.js`, new Response("chunk"));

    await cacheLocaleChunks(cache, ["en"], CHUNKS);

    expect(cache.added).toEqual(["/_app/immutable/chunks/en-b.js"]);
  });

  it("keeps the chunks that arrived when one fails, and reports the failure", async () => {
    const cache = new LocaleCache(new Set(["/_app/immutable/chunks/en-a.js"]));

    expect(await cacheLocaleChunks(cache, ["en", "ja"], CHUNKS)).toEqual([
      "/_app/immutable/chunks/en-a.js",
    ]);

    expect(await cache.match(`${ORIGIN}/_app/immutable/chunks/en-b.js`)).toBeDefined();
    expect(await cache.match(`${ORIGIN}/_app/immutable/chunks/ja-a.js`)).toBeDefined();
  });

  it("remembers offline locales as a growing set", async () => {
    const cache = new MemoryCache();
    expect(await readOfflineLocales(cache)).toEqual([]);

    await rememberOfflineLocales(cache, ["ja", "en"]);
    await rememberOfflineLocales(cache, ["en", "fr"]);

    expect(await readOfflineLocales(cache)).toEqual(["en", "fr", "ja"]);
  });

  it("treats a corrupt offline-locale record as empty", async () => {
    const cache = new MemoryCache();
    await cache.put(`${ORIGIN}/__offline-locales`, new Response("{not json"));

    expect(await readOfflineLocales(cache)).toEqual([]);
  });
});

describe("service-worker update handoff", () => {
  it("recognizes only the skip-waiting message", () => {
    expect(isSkipWaitingRequest({ type: SKIP_WAITING_MESSAGE })).toBe(true);
    expect(isSkipWaitingRequest({ type: CACHE_LOCALES_MESSAGE, locales: ["en"] })).toBe(false);
    expect(isSkipWaitingRequest(SKIP_WAITING_MESSAGE)).toBe(false);
    expect(isSkipWaitingRequest(null)).toBe(false);
  });
});
