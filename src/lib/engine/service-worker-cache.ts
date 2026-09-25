export const MAX_RUNTIME_ENTRIES = 50;
export const MAX_SPRITE_ENTRIES = 400;

/** Self-hosted fonts on R2: Satoshi plus the per-locale families under versioned prefixes. */
const EXTERNAL_FONT_PREFIX = "https://assets.mistria.fyi/fonts/";

/** Item and villager sprites on R2 — both live under this one entity-ID-keyed root. */
const EXTERNAL_SPRITE_PREFIX = "https://assets.mistria.fyi/sprites/";

/** Per-locale @font-face stylesheets; large and locale-specific, so cached on demand, not on install. */
const LAZY_ASSET_PATTERN = /\/locale-fonts-[^/]+\.css$/;

/** Persists across versions: which locales the player has asked to keep available offline. */
export const OFFLINE_LOCALES_CACHE = "offline-locales-v1";
const OFFLINE_LOCALES_KEY = "/__offline-locales";

/**
 * Page → service worker: cache every name chunk for these locales, now and after each update. A
 * message sent with a `MessagePort` gets a {@link CacheLocalesReply} on it once caching settles.
 */
export const CACHE_LOCALES_MESSAGE = "mfg:cache-locales";

export interface CacheLocalesMessage {
  locales: string[];
  type: typeof CACHE_LOCALES_MESSAGE;
}

/** The chunk paths still missing from the worker's cache after it tried to fetch them. */
export interface CacheLocalesReply {
  failed: string[];
}

/** Name-chunk paths per locale, as the build hands them to the service worker. */
export type LocaleNameChunks = Readonly<Record<string, readonly string[]>>;

type LocaleCache = Pick<Cache, "add" | "match">;
type OfflineLocalesCache = Pick<Cache, "match" | "put">;

type RuntimeCache = Pick<Cache, "delete" | "keys" | "put">;

interface RuntimeRequestDependencies {
  assetPaths: readonly string[];
  cache: RuntimeCache;
  fetcher: (request: Request) => Promise<Response>;
  matchCache: (request: RequestInfo | URL) => Promise<Response | undefined>;
  maxEntries?: number;
  offlinePath?: string;
}

/**
 * Caches every name chunk for `locales` that isn't cached yet. Best-effort: each chunk is fetched
 * independently, so one failure (the network dropping mid-download) keeps the chunks that did
 * arrive, and the next request retries only what's missing. Resolves with the paths that failed.
 */
export async function cacheLocaleChunks(
  cache: LocaleCache,
  locales: readonly string[],
  chunks: LocaleNameChunks,
): Promise<string[]> {
  const paths = [...new Set(locales.flatMap((locale) => chunks[locale] ?? []))];
  const results = await Promise.allSettled(
    paths.map(async (path) => {
      if (await cache.match(path)) return;
      await cache.add(path);
    }),
  );
  return paths.filter((_, index) => results[index]?.status === "rejected");
}

/**
 * The known locales a page asked the service worker to cache, or `undefined` for any other
 * message. Unknown locales are dropped rather than trusted.
 */
export function cacheLocalesRequest(data: unknown, chunks: LocaleNameChunks): string[] | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const { type, locales } = data as Partial<CacheLocalesMessage>;
  if (type !== CACHE_LOCALES_MESSAGE || !Array.isArray(locales)) return undefined;
  return [...new Set(locales)].filter((locale) => Object.hasOwn(chunks, locale));
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

/** Entity-ID-keyed, immutable sprites on R2: cached in their own bounded runtime cache, never precached. */
export function isExternalSpriteAsset(url: URL): boolean {
  return url.href.startsWith(EXTERNAL_SPRITE_PREFIX);
}

/**
 * Build assets that are fetched and cached on first use instead of during install: per-locale font
 * stylesheets and every locale's name chunks. A player's own locales are cached by
 * {@link cacheLocaleChunks} instead of waiting for each chunk's first request.
 */
export function isLazyAsset(pathname: string, localeChunkPaths: ReadonlySet<string>): boolean {
  return LAZY_ASSET_PATTERN.test(pathname) || localeChunkPaths.has(pathname);
}

/** The locales the player has asked to keep offline, across every version so far. */
export async function readOfflineLocales(cache: OfflineLocalesCache): Promise<string[]> {
  const response = await cache.match(OFFLINE_LOCALES_KEY);
  if (!response) return [];
  try {
    const locales: unknown = await response.json();
    return Array.isArray(locales)
      ? locales.filter((locale): locale is string => typeof locale === "string")
      : [];
  } catch {
    return [];
  }
}

/** Adds `locales` to the persisted offline set, so the next version's install caches them too. */
export async function rememberOfflineLocales(
  cache: OfflineLocalesCache,
  locales: readonly string[],
): Promise<void> {
  const remembered = await readOfflineLocales(cache);
  const next = [...new Set([...remembered, ...locales])].sort();
  if (next.length === remembered.length) return;
  await cache.put(
    OFFLINE_LOCALES_KEY,
    new Response(JSON.stringify(next), { headers: { "Content-Type": "application/json" } }),
  );
}
