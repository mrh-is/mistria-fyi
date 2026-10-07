import { PRODUCTION_ASSET_ORIGIN } from "#lib/asset-origin.js";

export const MAX_RUNTIME_ENTRIES = 50;
export const MAX_SPRITE_ENTRIES = 400;

/** Self-hosted fonts on R2: Satoshi plus the per-locale families under versioned prefixes. */
const EXTERNAL_FONT_PREFIX = `${PRODUCTION_ASSET_ORIGIN}/fonts/`;

/** Item and villager sprites on R2 — both live under this one entity-ID-keyed root. */
const EXTERNAL_SPRITE_PREFIX = `${PRODUCTION_ASSET_ORIGIN}/sprites/`;

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

/**
 * Page → waiting service worker: take over now. A new version installs and then waits, so tabs
 * running the old version keep the cache their modules came from until the player accepts the
 * update prompt.
 */
export const SKIP_WAITING_MESSAGE = "mfg:skip-waiting";

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
  assetPaths: ReadonlySet<string>;
  cache: RuntimeCache;
  fetcher: (request: Request) => Promise<Response>;
  matchCache: (request: RequestInfo | URL) => Promise<Response | undefined>;
  maxEntries?: number;
  offlinePath?: string;
  /** Keeps the worker alive for cache writes that settle after the response is returned. */
  waitUntil: (promise: Promise<unknown>) => void;
}

type SpriteCache = Pick<Cache, "delete" | "keys" | "match" | "put">;

interface SpriteRequestDependencies {
  cache: SpriteCache;
  fetcher: (request: Request) => Promise<Response>;
  maxEntries?: number;
  /** Keeps the worker alive for cache writes that settle after the response is returned. */
  waitUntil: (promise: Promise<unknown>) => void;
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
export function parseCacheLocalesMessage(
  data: unknown,
  chunks: LocaleNameChunks,
): string[] | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const { type, locales } = data as Partial<CacheLocalesMessage>;
  if (type !== CACHE_LOCALES_MESSAGE || !Array.isArray(locales)) return undefined;
  return [...new Set(locales)].filter((locale) => Object.hasOwn(chunks, locale));
}

export async function cacheRuntimeResponse(
  cache: RuntimeCache,
  request: Request,
  response: Response,
  assetPaths: ReadonlySet<string>,
  maxEntries = MAX_RUNTIME_ENTRIES,
): Promise<void> {
  await cache.put(request, response.clone());
  const keys = await cache.keys();
  const runtimeKeys = keys.filter((key) => {
    const url = new URL(key.url);
    return !assetPaths.has(url.pathname) && !isExternalFontAsset(url);
  });
  const excess = runtimeKeys.length - maxEntries;
  await Promise.all(runtimeKeys.slice(0, Math.max(0, excess)).map((key) => cache.delete(key)));
}

/**
 * Stores a sprite and enforces the cache's bounds. A sprite from an older `?g=` generation than
 * this one is stale art, so it goes at once rather than waiting to age out. Past that, the entry
 * bound evicts from the front of `keys()`, which is insertion order; {@link fetchSpriteRequest}
 * re-inserts on every hit, so the front is the least recently used.
 *
 * Only this sprite's own generation is evictable. A tab still running an older deploy must not
 * push out a newer deploy's art, so when newer sprites fill the cache, the older sprite just
 * stored is the one that goes.
 */
export async function cacheSpriteResponse(
  cache: SpriteCache,
  request: Request,
  response: Response,
  maxEntries = MAX_SPRITE_ENTRIES,
): Promise<void> {
  await cache.put(request, response);
  const generation = spriteGeneration(request.url);
  const keys = await cache.keys();
  const stale = keys.filter((key) => spriteGeneration(key.url) < generation);
  const evictable = keys.filter((key) => spriteGeneration(key.url) === generation);
  const excess = keys.length - stale.length - maxEntries;
  await Promise.all(
    [...stale, ...evictable.slice(0, Math.max(0, excess))].map((key) => cache.delete(key)),
  );
}

/**
 * Serves a request network-first, falling back to the cache and then the offline page. Only the
 * fetch decides between the two paths: the cache write is best-effort and happens off the response
 * path, so a failed write (a full quota) never discards a good network response.
 */
export async function fetchRuntimeRequest(
  request: Request,
  dependencies: RuntimeRequestDependencies,
): Promise<Response> {
  let response: Response;
  try {
    response = await dependencies.fetcher(request);
  } catch {
    const cached = await dependencies.matchCache(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await dependencies.matchCache(dependencies.offlinePath ?? "/offline.html");
      if (offline) return offline;
    }
    return Response.error();
  }
  if (response.ok) {
    dependencies.waitUntil(
      (async () => {
        try {
          await cacheRuntimeResponse(
            dependencies.cache,
            request,
            response,
            dependencies.assetPaths,
            dependencies.maxEntries,
          );
        } catch {
          // Best-effort cache write: a failed write never affects the response.
        }
      })(),
    );
  }
  return response;
}

/** Statuses that mean a sprite was withdrawn on purpose (a takedown), not that the network hiccuped. */
const WITHDRAWN_SPRITE_STATUSES: ReadonlySet<number> = new Set([403, 404, 410]);

/** A cached sprite younger than this (by its `Date` header) isn't revalidated on a hit. */
export const SPRITE_REVALIDATE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Revalidations in flight, by sprite URL, so concurrent hits share one request & one outcome. */
const spriteRevalidations = new Map<string, Promise<void>>();

/**
 * Serves a sprite stale-while-revalidate. A cached copy returns at once, so sprites keep working
 * offline. Once its `Date` header is a day old (or missing), a background request revalidates it so
 * removing a sprite from the bucket reaches installed clients: a fresh response replaces the entry,
 * a 403/404/410 evicts it so the next render shows the placeholder, & anything else (offline, a 5xx)
 * leaves it alone. A younger copy makes no request. The revalidation bypasses the HTTP cache,
 * because the one-day `max-age` would otherwise answer it locally. Withdrawal is only visible when
 * the answer is CORS-readable (see docs/takedown.md); a blocked response is a rejected fetch and
 * keeps the entry. A miss fetches, caches a successful response, and returns it. Cache writes are
 * best-effort and happen off the response path.
 */
export async function fetchSpriteRequest(
  request: Request,
  dependencies: SpriteRequestDependencies,
): Promise<Response> {
  const { cache, maxEntries } = dependencies;
  const cached = await cache.match(request);
  if (cached) {
    dependencies.waitUntil(
      (async () => {
        try {
          await (isSpriteStale(cached)
            ? revalidateSprite(request, dependencies)
            : touchSprite(request, cache));
        } catch {
          // Best-effort revalidation: a failed cache write leaves the entry as it was.
        }
      })(),
    );
    return cached;
  }
  let response: Response;
  try {
    response = await dependencies.fetcher(request);
  } catch {
    return Response.error();
  }
  if (response.ok) {
    const copy = response.clone();
    dependencies.waitUntil(
      (async () => {
        try {
          await cacheSpriteResponse(cache, request, copy, maxEntries);
        } catch {
          // Best-effort cache write: a failed write never affects the response.
        }
      })(),
    );
  }
  return response;
}

function isSpriteStale(cached: Response): boolean {
  const date = Date.parse(cached.headers.get("date") ?? "");
  return !(Date.now() - date < SPRITE_REVALIDATE_AFTER_MS);
}

/**
 * Moves a sprite to the back of the eviction order by putting its stored copy again, which replaces
 * the entry in one step: a rejected write leaves the old copy. Skips a sprite that was evicted since.
 */
async function touchSprite(request: Request, cache: SpriteCache): Promise<void> {
  const current = await cache.match(request);
  if (current) await cache.put(request, current);
}

async function refreshSprite(
  request: Request,
  dependencies: SpriteRequestDependencies,
): Promise<void> {
  const { cache, maxEntries } = dependencies;
  let response: Response | undefined;
  try {
    response = await dependencies.fetcher(new Request(request, { cache: "no-cache" }));
  } catch {
    // Offline or CORS-blocked: keep serving the cached copy.
  }
  if (response?.ok) {
    // Only refresh an entry that is still cached; put replaces it without a delete-first gap.
    if (await cache.match(request)) await cacheSpriteResponse(cache, request, response, maxEntries);
  } else if (response && WITHDRAWN_SPRITE_STATUSES.has(response.status)) {
    await cache.delete(request);
  } else {
    await touchSprite(request, cache);
  }
}

/** Refreshes, evicts, or touches the cached copy of one sprite; concurrent calls share one run. */
function revalidateSprite(
  request: Request,
  dependencies: SpriteRequestDependencies,
): Promise<void> {
  const existing = spriteRevalidations.get(request.url);
  if (existing) return existing;
  const run = (async () => {
    try {
      await refreshSprite(request, dependencies);
    } finally {
      spriteRevalidations.delete(request.url);
    }
  })();
  spriteRevalidations.set(request.url, run);
  return run;
}

export function isEligibleForRuntimeCaching(url: URL, origin: string): boolean {
  return (url.origin === origin && !url.pathname.startsWith("/api/")) || isExternalFontAsset(url);
}

/** Versioned, immutable font chunks: cached alongside build assets and exempt from LRU eviction. */
export function isExternalFontAsset(url: URL): boolean {
  return url.href.startsWith(EXTERNAL_FONT_PREFIX);
}

/** Entity-ID-keyed sprites on R2 (revalidated, so removable): cached in their own bounded runtime cache, never precached. */
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

/** Whether a page asked the waiting service worker to take over. */
export function isSkipWaitingRequest(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === SKIP_WAITING_MESSAGE
  );
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
  const next = [...new Set([...remembered, ...locales])].toSorted();
  if (next.length === remembered.length) return;
  await cache.put(OFFLINE_LOCALES_KEY, Response.json(next));
}

/** A sprite URL's `?g=` generation; URLs without one count as generation 0. */
function spriteGeneration(url: string): number {
  const generation = Number(new URL(url).searchParams.get("g") ?? 0);
  return Number.isFinite(generation) ? generation : 0;
}
