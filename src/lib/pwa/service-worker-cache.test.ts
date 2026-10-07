import { describe, expect, it, vi } from "vitest";

import {
  CACHE_LOCALES_MESSAGE,
  cacheLocaleChunks,
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
  parseCacheLocalesMessage,
  readOfflineLocales,
  rememberOfflineLocales,
  SKIP_WAITING_MESSAGE,
} from "./service-worker-cache.js";

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
    const url = requestUrl(request);
    this.entries.delete(url);
    this.entries.set(url, response.clone());
    return Promise.resolve();
  }
}

/** Runtime dependencies whose deferred cache writes a test can await with `settled()`. */
function dependencies(cache: MemoryCache, fetcher: (request: Request) => Promise<Response>) {
  const pending: Promise<unknown>[] = [];
  return {
    assetPaths: new Set(["/favicon.png"]),
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

/** The body text of a cached request, or `undefined` when nothing is cached for it. */
async function cachedText(cache: MemoryCache, request: Request): Promise<string | undefined> {
  const response = await cache.match(request);
  return response?.text();
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
    const stored = await cache.match(request);
    expect(await stored?.text()).toBe("fresh");
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

    const stored = await cache.match(request);
    expect(await stored?.text()).toBe("healthy");
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
    // `MemoryCache.put` records insertion order synchronously, so the order below is the LRU order.
    await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        cache.put(`${ORIGIN}/page-${String(index)}`, new Response(String(index))),
      ),
    );

    await cacheRuntimeResponse(
      cache,
      new Request(`${ORIGIN}/newest`),
      new Response("new"),
      new Set(["/favicon.png"]),
      50,
    );

    expect(await cache.match(`${ORIGIN}/page-0`)).toBeUndefined();
    const stored = await cache.match(`${ORIGIN}/newest`);
    expect(await stored?.text()).toBe("new");
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
    await cacheRuntimeResponse(cache, font, new Response("font"), new Set(), 1);
    await cacheRuntimeResponse(
      cache,
      new Request(`${ORIGIN}/animals`),
      new Response("a"),
      new Set(),
      1,
    );
    await cacheRuntimeResponse(
      cache,
      new Request(`${ORIGIN}/fish`),
      new Response("b"),
      new Set(),
      1,
    );

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

  it("serves a cached sprite at once, then refreshes it from the network", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_apple"));
    await cache.put(sprite, new Response("cached sprite"));
    const fetcher = vi.fn().mockResolvedValue(new Response("fresh sprite", { status: 200 }));
    const deps = spriteDependencies(cache, fetcher);

    const response = await fetchSpriteRequest(sprite, deps);
    await deps.settled();

    expect(await response.text()).toBe("cached sprite");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await cachedText(cache, sprite)).toBe("fresh sprite");
  });

  it("revalidates with the HTTP cache bypassed, so a stale max-age can't hide a takedown", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_apple"));
    await cache.put(sprite, new Response("cached sprite"));
    const fetcher = vi.fn().mockResolvedValue(new Response("fresh sprite", { status: 200 }));
    const deps = spriteDependencies(cache, fetcher);

    await fetchSpriteRequest(sprite, deps);
    await deps.settled();

    const revalidation = fetcher.mock.calls[0]?.[0] as Request;
    expect(revalidation.url).toBe(sprite.url);
    expect(revalidation.cache).toBe("no-cache");
  });

  it.each([403, 404, 410])(
    "evicts a cached sprite once the network answers %i, after serving it",
    async (status) => {
      const cache = new MemoryCache();
      const sprite = new Request(spriteUrl("spr_ui_item_apple"));
      await cache.put(sprite, new Response("cached sprite"));
      const deps = spriteDependencies(
        cache,
        vi.fn().mockResolvedValue(new Response("gone", { status })),
      );

      const response = await fetchSpriteRequest(sprite, deps);
      await deps.settled();

      expect(await response.text()).toBe("cached sprite");
      expect(await cache.match(sprite)).toBeUndefined();
    },
  );

  it.each([
    ["23 hours", 23, false],
    ["25 hours", 25, true],
  ])("a sprite cached %s ago is revalidated: %s", async (_label, hours, revalidated) => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_apple"));
    const date = new Date(Date.now() - hours * 60 * 60 * 1000).toUTCString();
    await cache.put(sprite, new Response("cached sprite", { headers: { date } }));
    const fetcher = vi.fn().mockResolvedValue(new Response("gone", { status: 404 }));
    const deps = spriteDependencies(cache, fetcher);

    const response = await fetchSpriteRequest(sprite, deps);
    await deps.settled();

    expect(await response.text()).toBe("cached sprite");
    expect(fetcher).toHaveBeenCalledTimes(revalidated ? 1 : 0);
    expect(cache.entries.size).toBe(revalidated ? 0 : 1);
  });

  it("shares one revalidation between concurrent hits, so a 404 can't be undone", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_race"));
    await cache.put(sprite, new Response("cached sprite"));
    const deferred = Promise.withResolvers<Response>();
    const fetcher = vi.fn().mockReturnValueOnce(deferred.promise);
    fetcher.mockRejectedValue(new Error("offline"));
    const first = spriteDependencies(cache, fetcher);
    const second = spriteDependencies(cache, fetcher);

    await fetchSpriteRequest(sprite, first);
    await fetchSpriteRequest(sprite, second);
    deferred.resolve(new Response("gone", { status: 404 }));
    await first.settled();
    await second.settled();

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.entries.size).toBe(0);
  });

  it("keeps the old copy when writing the replacement fails", async () => {
    const cache = new MemoryCache();
    vi.spyOn(cache, "put").mockRejectedValue(new Error("quota"));
    const sprite = new Request(spriteUrl("spr_ui_item_apple"));
    cache.entries.set(sprite.url, new Response("cached sprite"));
    const deps = spriteDependencies(
      cache,
      vi.fn().mockResolvedValue(new Response("fresh", { status: 200 })),
    );

    await fetchSpriteRequest(sprite, deps);
    await deps.settled();

    expect(await cachedText(cache, sprite)).toBe("cached sprite");
  });

  it("keeps a cached sprite through a transient server error", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_apple"));
    await cache.put(sprite, new Response("cached sprite"));
    const deps = spriteDependencies(
      cache,
      vi.fn().mockResolvedValue(new Response("oops", { status: 503 })),
    );

    await fetchSpriteRequest(sprite, deps);
    await deps.settled();

    expect(await cachedText(cache, sprite)).toBe("cached sprite");
  });

  it("fetches and caches an uncached sprite", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_apple"));
    const deps = spriteDependencies(
      cache,
      vi.fn().mockResolvedValue(new Response("sprite", { status: 200 })),
    );

    const response = await fetchSpriteRequest(sprite, deps);
    await deps.settled();

    expect(await response.text()).toBe("sprite");
    const stored = await cache.match(sprite);
    expect(await stored?.text()).toBe("sprite");
  });

  it("does not cache an opaque no-cors response (crossorigin is required on every sprite img/image)", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_opaque"));
    // An <img>/<image> fetched without crossorigin="anonymous" yields an opaque response here:
    // status 0, ok false. Response.error() models the same "not ok" shape fetchSpriteRequest
    // gates on; a real opaque Response can't be constructed directly in this test environment.
    const deps = spriteDependencies(cache, vi.fn().mockResolvedValue(Response.error()));

    const response = await fetchSpriteRequest(sprite, deps);
    await deps.settled();

    expect(response.ok).toBe(false);
    expect(await cache.match(sprite)).toBeUndefined();
  });

  it("does not cache a failed response", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_missing"));
    const deps = spriteDependencies(
      cache,
      vi.fn().mockResolvedValue(new Response("not found", { status: 404 })),
    );

    const response = await fetchSpriteRequest(sprite, deps);
    await deps.settled();

    expect(response.status).toBe(404);
    expect(cache.entries.size).toBe(0);
  });

  it("returns a previously cached sprite when offline", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_apple"));
    await cache.put(sprite, new Response("cached sprite"));

    const deps = spriteDependencies(cache, vi.fn().mockRejectedValue(new Error("offline")));

    const response = await fetchSpriteRequest(sprite, deps);
    await deps.settled();

    expect(await response.text()).toBe("cached sprite");
    expect(await cachedText(cache, sprite)).toBe("cached sprite");
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
    await Promise.all(
      Array.from({ length: MAX_SPRITE_ENTRIES }, (_, index) =>
        cache.put(spriteUrl(`spr_${String(index)}`), new Response(String(index))),
      ),
    );

    await cacheSpriteResponse(cache, new Request(spriteUrl("spr_newest")), new Response("newest"));

    expect(await cache.match(spriteUrl("spr_0"))).toBeUndefined();
    expect(await cache.match(spriteUrl("spr_newest"))).toBeDefined();
    expect(cache.entries.size).toBe(MAX_SPRITE_ENTRIES);
  });

  it("evicts the least recently used sprite, not the oldest-inserted one", async () => {
    const cache = new MemoryCache();
    await cache.put(spriteUrl("spr_a"), new Response("a"));
    await cache.put(spriteUrl("spr_b"), new Response("b"));
    const deps = spriteDependencies(cache, vi.fn().mockRejectedValue(new Error("offline")));

    await fetchSpriteRequest(new Request(spriteUrl("spr_a")), deps);
    await deps.settled();
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
    await Promise.all(
      Array.from({ length: MAX_SPRITE_ENTRIES }, (_, index) =>
        cache.put(spriteUrl(`spr_${String(index)}`, 2), new Response(String(index))),
      ),
    );

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
    private readonly failing: ReadonlySet<string>;

    constructor(failing: ReadonlySet<string> = new Set()) {
      super();
      this.failing = failing;
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
      parseCacheLocalesMessage(
        { type: CACHE_LOCALES_MESSAGE, locales: ["ja", "en", "ja", "xx"] },
        CHUNKS,
      ),
    ).toEqual(["ja", "en"]);
    expect(
      parseCacheLocalesMessage({ type: CACHE_LOCALES_MESSAGE, locales: ["constructor"] }, CHUNKS),
    ).toEqual([]);
    expect(parseCacheLocalesMessage({ type: "other", locales: ["ja"] }, CHUNKS)).toBeUndefined();
    expect(parseCacheLocalesMessage({ type: CACHE_LOCALES_MESSAGE }, CHUNKS)).toBeUndefined();
    expect(parseCacheLocalesMessage("mfg:cache-locales", CHUNKS)).toBeUndefined();
    expect(parseCacheLocalesMessage(null, CHUNKS)).toBeUndefined();
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
