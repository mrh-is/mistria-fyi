export const MAX_RUNTIME_ENTRIES = 50;
export const MAX_SPRITE_ENTRIES = 400;

/** Self-hosted fonts on R2: Satoshi plus the per-locale families under versioned prefixes. */
const EXTERNAL_FONT_PREFIX = "https://assets.mistria.fyi/fonts/";

/** Item and villager sprites on R2, under versioned prefixes. See {@link isExternalSpriteAsset}. */
const EXTERNAL_SPRITE_PREFIXES = [
  "https://assets.mistria.fyi/sprites/",
  "https://assets.mistria.fyi/villager-sprites/",
];

/** Per-locale @font-face stylesheets; large and locale-specific, so cached on demand, not on install. */
const LAZY_ASSET_PATTERN = /\/locale-fonts-[^/]+\.css$/;

type RuntimeCache = Pick<Cache, "delete" | "keys" | "put">;

interface RuntimeRequestDependencies {
  assetPaths: readonly string[];
  cache: RuntimeCache;
  fetcher: (request: Request) => Promise<Response>;
  matchCache: (request: RequestInfo | URL) => Promise<Response | undefined>;
  maxEntries?: number;
  offlinePath?: string;
}

export async function cacheRuntimeResponse(
  cache: RuntimeCache,
  request: Request,
  response: Response,
  assetPaths: readonly string[],
  maxEntries = MAX_RUNTIME_ENTRIES,
): Promise<void> {
  await cache.put(request, response.clone());
  const keys = await cache.keys();
  const runtimeKeys = keys.filter((key) => {
    const url = new URL(key.url);
    return !assetPaths.includes(url.pathname) && !isExternalFontAsset(url);
  });
  const excess = runtimeKeys.length - maxEntries;
  for (const key of runtimeKeys.slice(0, Math.max(0, excess))) {
    await cache.delete(key);
  }
}

export async function fetchRuntimeRequest(
  request: Request,
  dependencies: RuntimeRequestDependencies,
): Promise<Response> {
  try {
    const response = await dependencies.fetcher(request);
    if (response.ok) {
      await cacheRuntimeResponse(
        dependencies.cache,
        request,
        response,
        dependencies.assetPaths,
        dependencies.maxEntries,
      );
    }
    return response;
  } catch {
    const cached = await dependencies.matchCache(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await dependencies.matchCache(dependencies.offlinePath ?? "/offline.html");
      if (offline) return offline;
    }
    return Response.error();
  }
}

export function isEligibleForRuntimeCaching(url: URL, origin: string): boolean {
  return (url.origin === origin && !url.pathname.startsWith("/api/")) || isExternalFontAsset(url);
}

/** Versioned, immutable font chunks: cached alongside build assets and exempt from LRU eviction. */
export function isExternalFontAsset(url: URL): boolean {
  return url.href.startsWith(EXTERNAL_FONT_PREFIX);
}

/** Versioned, immutable sprites on R2: cached in their own bounded runtime cache, never precached. */
export function isExternalSpriteAsset(url: URL): boolean {
  return EXTERNAL_SPRITE_PREFIXES.some((prefix) => url.href.startsWith(prefix));
}

/** Build assets that are fetched and cached on first use instead of during install. */
export function isLazyAsset(pathname: string): boolean {
  return LAZY_ASSET_PATTERN.test(pathname);
}
