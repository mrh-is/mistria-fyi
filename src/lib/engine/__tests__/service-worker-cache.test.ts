import { describe, expect, it, vi } from "vitest";

import {
  cacheRuntimeResponse,
  fetchRuntimeRequest,
  isEligibleForRuntimeCaching,
} from "../service-worker-cache.js";

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
