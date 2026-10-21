import { describe, expect, it, vi } from "vitest";

import {
  CACHE_LOCALES_MESSAGE,
  cacheLocaleChunks,
  cacheLocaleHome,
  cacheRuntimeResponse,
  cacheSpriteResponse,
  fetchRuntimeRequest,
  fetchSpriteRequest,
  fetchStrategy,
  isEligibleForRuntimeCaching,
  isExternalFontAsset,
  isExternalSpriteAsset,
  isLazyAsset,
  isSkipWaitingRequest,
  lastLocaleStore,
  MAX_SPRITE_ENTRIES,
  mayDeleteRetainedCaches,
  obsoleteCaches,
  parseCacheLocalesMessage,
  parseCurrentLocale,
  readOfflineLocales,
  readRetainedCaches,
  rememberOfflineLocales,
  rememberRetainedCaches,
  SKIP_WAITING_MESSAGE,
  SPRITE_CACHED_AT_HEADER,
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
  const lastLocaleCache = new MemoryCache();
  return {
    assetPaths: new Set(["/favicon.png"]),
    cache,
    fetcher,
    lastLocale: lastLocaleStore(() => Promise.resolve(lastLocaleCache)),
    lastLocaleCache,
    matchCache: (request: RequestInfo | URL) => cache.match(request),
    offlinePage: () => new Response("offline page"),
    settled: () => Promise.all(pending),
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
  };
}

function navigation(path: string): Request {
  const request = new Request(`${ORIGIN}${path}`);
  Object.defineProperty(request, "mode", { value: "navigate" });
  return request;
}

/** A response that followed a redirect to `location` (a path or URL), as `fetch` reports it. */
function redirectedResponse(body: string, location: string): Response {
  const response = new Response(body, { status: 200 });
  Object.defineProperty(response, "redirected", { value: true });
  Object.defineProperty(response, "url", { value: new URL(location, ORIGIN).href });
  return response;
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

describe("service-worker fetch strategy", () => {
  const assetPaths = new Set(["/_app/immutable/entry/start.js"]);
  const strategyFor = (url: string, method = "GET") =>
    fetchStrategy({ method, url }, assetPaths, ORIGIN);

  it("routes cached requests to their cache", () => {
    expect(strategyFor(`${ORIGIN}/_app/immutable/entry/start.js`)).toBe("asset");
    expect(strategyFor("https://assets.mistria.fyi/sprites/items/apple.webp")).toBe("sprite");
    expect(strategyFor(`${ORIGIN}/en/villagers`)).toBe("runtime");
  });

  // After an update takes over, a page still on the old version imports the old build's chunks,
  // which the server no longer has. Only the old version's cache does (#111).
  it("answers another version's build assets from the caches", () => {
    expect(strategyFor(`${ORIGIN}/_app/immutable/chunks/older.Ab12.js`)).toBe("asset");
    expect(
      strategyFor("https://elsewhere.test/_app/immutable/chunks/older.Ab12.js"),
    ).toBeUndefined();
    expect(
      fetchStrategy(
        { method: "GET", url: `${ORIGIN}/guide/_app/immutable/chunks/older.js` },
        assetPaths,
        ORIGIN,
        "/guide/_app/version.json",
        "/guide/_app/immutable/",
      ),
    ).toBe("asset");
  });

  it("runtime-caches fonts", () => {
    expect(strategyFor("https://assets.mistria.fyi/fonts/satoshi-regular.woff2")).toBe("runtime");
  });

  it("leaves requests it doesn't cache to the browser", () => {
    expect(strategyFor(`${ORIGIN}/_app/version.json`)).toBeUndefined();
    expect(strategyFor("https://static.cloudflareinsights.com/beacon.min.js")).toBeUndefined();
    expect(strategyFor("https://api.cardpointers.com/v1/offers")).toBeUndefined();
    expect(strategyFor(`${ORIGIN}/api/feedback`)).toBeUndefined();
    expect(strategyFor(`${ORIGIN}/en/villagers`, "POST")).toBeUndefined();
  });

  it("bypasses version metadata under the registration scope, even if listed as an asset", () => {
    const versionPath = "/guide/_app/version.json";
    expect(
      fetchStrategy(
        { method: "GET", url: `${ORIGIN}${versionPath}?v=1` },
        new Set([versionPath]),
        ORIGIN,
        versionPath,
      ),
    ).toBeUndefined();
    expect(strategyFor(`${ORIGIN}/_app/version.json.backup`)).toBe("runtime");
  });
});

describe("service-worker runtime request path", () => {
  it("returns the current network HTML even when the active worker has an older cached navigation", async () => {
    const cache = new MemoryCache();
    const request = navigation("/en");
    await cache.put(request, new Response("old build"));
    const deps = dependencies(cache, vi.fn().mockResolvedValue(new Response("new build")));

    const response = await fetchRuntimeRequest(request, deps);

    expect(await response.text()).toBe("new build");
    await deps.settled();
    expect(await cachedText(cache, request)).toBe("new build");
  });

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

  it("caches the response even after the page has consumed its body", async () => {
    const cache = new MemoryCache();
    const request = navigation("/en/animals");
    const deps = dependencies(
      cache,
      vi.fn().mockResolvedValue(new Response("fresh", { status: 200 })),
    );

    const response = await fetchRuntimeRequest(request, deps);
    expect(await response.text()).toBe("fresh");
    await deps.settled();

    expect(await cachedText(cache, request)).toBe("fresh");
  });

  it("returns the network response when the cache write fails", async () => {
    const cache = new MemoryCache();
    const request = new Request(`${ORIGIN}/animals`);
    Object.defineProperty(request, "mode", { value: "navigate" });
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
    const request = new Request(`${ORIGIN}/missing`);
    Object.defineProperty(request, "mode", { value: "navigate" });

    const response = await fetchRuntimeRequest(
      request,
      dependencies(cache, vi.fn().mockRejectedValue(new Error("offline"))),
    );

    expect(await response.text()).toBe("offline page");
  });
});

/** A fetcher that fails as `fetch` does without a network. */
function offline() {
  return vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
}

describe("service-worker offline launch from start_url", () => {
  it("redirects an offline launch at / to the last-used locale's cached home", async () => {
    const cache = new MemoryCache();
    await cache.put(`${ORIGIN}/en`, new Response("en home"));
    await cache.put(`${ORIGIN}/ja`, new Response("ja home"));
    const deps = dependencies(cache, offline());
    await deps.lastLocale.remember("ja");

    const response = await fetchRuntimeRequest(navigation("/"), deps);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/ja`);
    expect(response.redirected).toBe(false);
  });

  it("keeps the rest of a bare path and its query in the redirect", async () => {
    const cache = new MemoryCache();
    await cache.put(`${ORIGIN}/en/animals?q=cow`, new Response("animals"));

    const response = await fetchRuntimeRequest(
      navigation("/animals?q=cow"),
      dependencies(cache, offline()),
    );

    expect(response.headers.get("location")).toBe(`${ORIGIN}/en/animals?q=cow`);
  });

  it("falls back to another cached locale when the last-used one isn't cached", async () => {
    const cache = new MemoryCache();
    await cache.put(`${ORIGIN}/fr`, new Response("fr home"));
    const deps = dependencies(cache, offline());
    await deps.lastLocale.remember("ja");

    const response = await fetchRuntimeRequest(navigation("/"), deps);

    expect(response.headers.get("location")).toBe(`${ORIGIN}/fr`);
  });

  it("prefers a cached locale page over the bare path's cached stub", async () => {
    const cache = new MemoryCache();
    await cache.put(`${ORIGIN}/`, new Response("stub"));
    await cache.put(`${ORIGIN}/ja`, new Response("ja home"));
    const deps = dependencies(cache, offline());
    await deps.lastLocale.remember("ja");

    const response = await fetchRuntimeRequest(navigation("/"), deps);

    expect(response.headers.get("location")).toBe(`${ORIGIN}/ja`);
  });

  it("serves the bare path's cached stub when no locale's page is cached", async () => {
    const cache = new MemoryCache();
    await cache.put(`${ORIGIN}/`, new Response("stub"));

    const response = await fetchRuntimeRequest(navigation("/"), dependencies(cache, offline()));

    expect(await response.text()).toBe("stub");
  });

  it("serves the offline page when no locale's page is cached", async () => {
    const response = await fetchRuntimeRequest(
      navigation("/"),
      dependencies(new MemoryCache(), offline()),
    );

    expect(await response.text()).toBe("offline page");
  });

  it.each(["/en/missing", "/sitemap.xml"])(
    "doesn't redirect the locale-prefixed or unlocalized navigation %s",
    async (path) => {
      const cache = new MemoryCache();
      await cache.put(`${ORIGIN}/en/sitemap.xml`, new Response("wrong"));
      await cache.put(`${ORIGIN}/en/en/missing`, new Response("wrong"));

      const response = await fetchRuntimeRequest(navigation(path), dependencies(cache, offline()));

      expect(await response.text()).toBe("offline page");
    },
  );

  it("remembers the locale of the latest page load, not of preloaded data", async () => {
    const deps = dependencies(new MemoryCache(), vi.fn().mockResolvedValue(new Response("ok")));

    await fetchRuntimeRequest(navigation("/ja"), deps);
    await fetchRuntimeRequest(navigation("/zh-Hans/animals"), deps);
    await fetchRuntimeRequest(new Request(`${ORIGIN}/fr/animals/__data.json`), deps);
    await fetchRuntimeRequest(navigation("/sitemap.xml"), deps);
    await deps.settled();

    // A fresh store reads what was persisted, as a restarted worker would.
    expect(await lastLocaleStore(() => Promise.resolve(deps.lastLocaleCache)).read()).toBe(
      "zh-Hans",
    );
  });

  it("keeps caching a redirected non-navigation response under its request", async () => {
    const cache = new MemoryCache();
    const request = new Request(`${ORIGIN}/en/animals/__data.json`);
    const deps = dependencies(
      cache,
      vi.fn().mockResolvedValue(redirectedResponse("data", "/en/other/__data.json")),
    );

    await fetchRuntimeRequest(request, deps);
    await deps.settled();

    expect(await cachedText(cache, request)).toBe("data");
  });

  it.each(["/ja", "https://example.com/x"])(
    "answers a navigation that followed a redirect to %s with the redirect, caching nothing",
    async (location) => {
      const cache = new MemoryCache();
      const deps = dependencies(
        cache,
        vi.fn().mockResolvedValue(redirectedResponse("landed", location)),
      );

      const response = await fetchRuntimeRequest(navigation("/"), deps);
      await deps.settled();

      expect(response.status).toBe(302);
      expect(response.redirected).toBe(false);
      expect(response.headers.get("location")).toBe(new URL(location, ORIGIN).href);
      expect(cache.entries.size).toBe(0);
      expect(await deps.lastLocale.read()).toBeUndefined();
    },
  );

  it("drops the query from the redirect when only the page without it is cached", async () => {
    const cache = new MemoryCache();
    await cache.put(`${ORIGIN}/ja`, new Response("ja home"));
    const deps = dependencies(cache, offline());
    await deps.lastLocale.remember("ja");

    const response = await fetchRuntimeRequest(navigation("/?source=pwa"), deps);

    expect(response.headers.get("location")).toBe(`${ORIGIN}/ja`);
  });
});

describe("service-worker last-used locale", () => {
  it("ignores a corrupt or unknown remembered locale", async () => {
    const cache = new MemoryCache();
    await cache.put(`${ORIGIN}/__last-locale`, new Response("{not json"));
    expect(await lastLocaleStore(() => Promise.resolve(cache)).read()).toBeUndefined();

    await cache.put(`${ORIGIN}/__last-locale`, Response.json("xx"));
    expect(await lastLocaleStore(() => Promise.resolve(cache)).read()).toBeUndefined();
  });

  it("stores the latest locale even when an earlier write settles last", async () => {
    const cache = new MemoryCache();
    const put = vi.spyOn(cache, "put");
    // The first write is slow; without ordering it would land after the second.
    put.mockImplementationOnce(async (request, response) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
      await MemoryCache.prototype.put.call(cache, request, response);
    });
    const store = lastLocaleStore(() => Promise.resolve(cache));

    await Promise.all([store.remember("ja"), store.remember("fr")]);

    expect(await lastLocaleStore(() => Promise.resolve(cache)).read()).toBe("fr");
  });

  // An update's installing worker and the active one each hold a store over the same cache (#18).
  it("reads and rewrites what another worker's store remembered since", async () => {
    const cache = new MemoryCache();
    const installing = lastLocaleStore(() => Promise.resolve(cache));
    const active = lastLocaleStore(() => Promise.resolve(cache));

    await installing.remember("en");
    await active.remember("ja");
    expect(await installing.read()).toBe("ja");

    await active.remember("en");
    await installing.remember("ja");
    expect(await active.read()).toBe("ja");
    await active.remember("en");
    expect(await installing.read()).toBe("en");
  });

  it("retries a locale whose write failed", async () => {
    const cache = new MemoryCache();
    vi.spyOn(cache, "put").mockRejectedValueOnce(new DOMException("Full", "QuotaExceededError"));
    const store = lastLocaleStore(() => Promise.resolve(cache));

    await store.remember("ja");
    expect(await lastLocaleStore(() => Promise.resolve(cache)).read()).toBeUndefined();
    await store.remember("ja");

    expect(await lastLocaleStore(() => Promise.resolve(cache)).read()).toBe("ja");
  });

  it("reads the page's current locale from a cache-locales message", () => {
    expect(
      parseCurrentLocale({ type: CACHE_LOCALES_MESSAGE, current: "ja", locales: ["en", "ja"] }),
    ).toBe("ja");
    expect(parseCurrentLocale({ type: CACHE_LOCALES_MESSAGE, locales: ["ja"] })).toBeUndefined();
    expect(
      parseCurrentLocale({ type: CACHE_LOCALES_MESSAGE, current: "xx", locales: [] }),
    ).toBeUndefined();
    expect(parseCurrentLocale({ type: SKIP_WAITING_MESSAGE, current: "ja" })).toBeUndefined();
    expect(parseCurrentLocale(null)).toBeUndefined();
  });
});

describe("service-worker locale home pages", () => {
  it("fetches and caches a locale's home page", async () => {
    const cache = new MemoryCache();
    const fetched: string[] = [];
    const fetcher = (request: Request) => {
      fetched.push(new URL(request.url).pathname);
      return Promise.resolve(new Response("ja home"));
    };

    expect(await cacheLocaleHome(cache, "ja", `${ORIGIN}/`, fetcher)).toBe(true);

    expect(fetched).toEqual(["/ja"]);
    expect(await cachedText(cache, new Request(`${ORIGIN}/ja`))).toBe("ja home");
  });

  it("doesn't refetch a home page that's already cached", async () => {
    const cache = new MemoryCache();
    await cache.put(`${ORIGIN}/ja`, new Response("cached"));
    const fetcher = vi.fn();

    expect(await cacheLocaleHome(cache, "ja", `${ORIGIN}/`, fetcher)).toBe(true);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ["a failed", () => new Response("bad", { status: 500 })],
    ["a redirected", () => redirectedResponse("elsewhere", "/en")],
  ])("doesn't store %s response", async (_, response) => {
    const cache = new MemoryCache();

    expect(
      await cacheLocaleHome(cache, "ja", `${ORIGIN}/`, vi.fn().mockResolvedValue(response())),
    ).toBe(false);

    expect(cache.entries.size).toBe(0);
  });
});

/** Named caches holding the given paths, as `CacheStorage` opens them. */
function storage(contents: Record<string, string[]>) {
  const named = new Map<string, MemoryCache>();
  for (const [name, paths] of Object.entries(contents)) {
    const cache = new MemoryCache();
    for (const path of paths) cache.entries.set(`${ORIGIN}${path}`, new Response(path));
    named.set(name, cache);
  }
  return { open: (name: string) => Promise.resolve(named.get(name) ?? new MemoryCache()) };
}

describe("service-worker obsolete caches", () => {
  const OLDER = ["cache-old", "cache-older"];

  it("lists every older version once the current one holds the last-used home page", async () => {
    const caches = storage({
      "cache-new": ["/ja"],
      "cache-old": ["/ja", "/en"],
      "cache-older": ["/ja"],
    });

    expect(await obsoleteCaches(caches, "cache-new", OLDER, "ja", `${ORIGIN}/`)).toEqual(OLDER);
  });

  // The new version's own fetch of the home page failed, during install or offline (#18).
  it("keeps an older version that holds the only copy of the last-used home page", async () => {
    const caches = storage({ "cache-new": ["/en"], "cache-old": ["/ja"], "cache-older": ["/en"] });

    expect(await obsoleteCaches(caches, "cache-new", OLDER, "ja", `${ORIGIN}/`)).toEqual([
      "cache-older",
    ]);
  });

  // `caches.keys()` lists caches in creation order, so the last one listed is the newest.
  it("keeps only the newest older version holding the last-used home page", async () => {
    const caches = storage({ "cache-new": [], "cache-v1": ["/ja"], "cache-v2": ["/ja"] });

    expect(
      await obsoleteCaches(caches, "cache-new", ["cache-v1", "cache-v2"], "ja", `${ORIGIN}/`),
    ).toEqual(["cache-v1"]);
  });

  it("lists every older version when no locale has been used", async () => {
    const caches = storage({ "cache-new": [], "cache-old": ["/en"] });

    expect(await obsoleteCaches(caches, "cache-new", OLDER, undefined, `${ORIGIN}/`)).toEqual(
      OLDER,
    );
  });

  it("persists the caches an activation kept, reading a corrupt record as none", async () => {
    const cache = new MemoryCache();
    expect(await readRetainedCaches(cache)).toEqual([]);

    await rememberRetainedCaches(cache, ["cache-old"]);
    expect(await readRetainedCaches(cache)).toEqual(["cache-old"]);

    await cache.put(`${ORIGIN}/__retained-caches`, new Response("{not json"));
    expect(await readRetainedCaches(cache)).toEqual([]);
  });

  // Cache names are deterministic per commit, so a rollback's new version can reuse a kept name.
  it.each<[string, ServiceWorkerState | undefined, object, boolean]>([
    ["active with no other version", "activated", {}, true],
    ["still activating", "activating", {}, false],
    ["without self.serviceWorker", undefined, {}, false],
    ["with a version installing", "activated", { installing: {} }, false],
    ["with a version waiting", "activated", { waiting: {} }, false],
  ])("deletes kept caches only when %s", (_, state, others, expected) => {
    const registration = { installing: null, waiting: null, ...others };
    expect(mayDeleteRetainedCaches(state, registration)).toBe(expected);
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

  it("exempts locale home pages, the offline launch targets, from eviction", async () => {
    const cache = new MemoryCache();
    await cache.put(`${ORIGIN}/en`, new Response("en home"));
    await cache.put(`${ORIGIN}/en?q=1`, new Response("query"));
    await cache.put(`${ORIGIN}/page-0`, new Response("0"));
    await cache.put(`${ORIGIN}/page-1`, new Response("1"));

    await cacheRuntimeResponse(
      cache,
      new Request(`${ORIGIN}/newest`),
      new Response("new"),
      new Set(),
      2,
    );

    expect(await cache.match(`${ORIGIN}/en`)).toBeDefined();
    expect(await cache.match(`${ORIGIN}/en?q=1`)).toBeUndefined();
    expect(await cache.match(`${ORIGIN}/page-0`)).toBeUndefined();
    expect(await cache.match(`${ORIGIN}/page-1`)).toBeDefined();
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
    const stamp = String(Date.now() - hours * 60 * 60 * 1000);
    await cache.put(
      sprite,
      new Response("cached sprite", { headers: { [SPRITE_CACHED_AT_HEADER]: stamp } }),
    );
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

  it("throttles revalidation by its own stamp when the response exposes no Date header", async () => {
    const cache = new MemoryCache();
    const sprite = new Request(spriteUrl("spr_ui_item_apple"));
    // A CORS response from R2 exposes neither Date nor any other unsafelisted header.
    const fetcher = vi.fn().mockResolvedValue(new Response("sprite", { status: 200 }));
    const first = spriteDependencies(cache, fetcher);
    await fetchSpriteRequest(sprite, first);
    await first.settled();
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = spriteDependencies(cache, fetcher);
    const response = await fetchSpriteRequest(sprite, second);
    await second.settled();
    const third = spriteDependencies(cache, fetcher);
    await fetchSpriteRequest(sprite, third);
    await third.settled();

    expect(await response.text()).toBe("sprite");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.entries.get(sprite.url)?.headers.has(SPRITE_CACHED_AT_HEADER)).toBe(true);
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
