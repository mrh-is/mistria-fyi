import { PRODUCTION_ASSET_ORIGIN } from "#lib/asset-origin.js";
import { UNLOCALIZED_PATH_PREFIXES } from "#lib/i18n/paraglide-options.js";
import { LOCALE_CODES } from "#lib/types/locale.js";

import type { LocaleCode } from "#lib/types/locale.js";

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
/** In {@link OFFLINE_LOCALES_CACHE} too: the locale of the player's most recent page. */
const LAST_LOCALE_KEY = "/__last-locale";

/** The locale the player last browsed in, which an offline launch at a bare path opens. */
export interface LastLocaleStore {
  read: () => Promise<LocaleCode | undefined>;
  /** Best-effort: resolves once written, or once the write has failed, and never rejects. */
  remember: (locale: LocaleCode) => Promise<void>;
}

/**
 * Page → service worker: cache every name chunk for these locales, now and after each update. A
 * message sent with a `MessagePort` gets a {@link CacheLocalesReply} on it once caching settles.
 */
export const CACHE_LOCALES_MESSAGE = "mfg:cache-locales";

export interface CacheLocalesMessage {
  /**
   * The locale the page is showing, when the page sends it. The worker records it as the
   * last-used locale and caches its home page for an offline launch (#728).
   */
  current?: string;
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
  lastLocale: LastLocaleStore;
  matchCache: (request: RequestInfo | URL) => Promise<Response | undefined>;
  maxEntries?: number;
  /** Builds the page an uncached navigation gets when the network fails. */
  offlinePage: () => Response;
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

/** The known locale a cache-locales message says the page is showing, if it names one. */
export function parseCurrentLocale(data: unknown): LocaleCode | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const { type, current } = data as Partial<CacheLocalesMessage>;
  if (type !== CACHE_LOCALES_MESSAGE) return undefined;
  return LOCALE_CODES.find((locale) => locale === current);
}

/**
 * Caches `locale`'s home page (`/en`), the page an offline launch at `start_url` opens, unless
 * it's cached already. A redirected or failed response isn't stored. Resolves whether the page is
 * cached afterward.
 *
 * The installed app's first page load happens before the worker exists, and browsing after that
 * is client-side, so no page load passes through the worker to cache it. A new version's install
 * calls this too, because activating deletes the old version's cache, home pages included.
 */
export async function cacheLocaleHome(
  cache: Pick<Cache, "match" | "put">,
  locale: LocaleCode,
  base: string,
  fetcher: (request: Request) => Promise<Response>,
): Promise<boolean> {
  const request = new Request(new URL(`/${locale}`, base));
  if (await cache.match(request)) return true;
  const response = await fetcher(request);
  if (!response.ok || response.redirected) return false;
  await cache.put(request, response);
  return true;
}

/**
 * Which of the `older` versions' caches `current` can delete: all of them, except one holding the
 * only copy of `lastLocale`'s home page. That page is where an offline launch lands, and the new
 * version's own fetch of it may have failed (a dropped connection during install, or a switch made
 * offline). Copying it across isn't an option, since it imports its own version's chunks, so the
 * older cache stays, chunks and all, until `current` has the page (#18).
 */
export async function obsoleteCaches(
  storage: { open: (name: string) => Promise<Pick<Cache, "match">> },
  current: string,
  older: readonly string[],
  lastLocale: LocaleCode | undefined,
  base: string,
): Promise<string[]> {
  if (!lastLocale) return [...older];
  const home = new URL(`/${lastLocale}`, base).href;
  async function holdsHome(name: string): Promise<boolean> {
    const cache = await storage.open(name);
    return (await cache.match(home)) !== undefined;
  }
  if (await holdsHome(current)) return [...older];
  const held = await Promise.all(older.map(async (name) => holdsHome(name)));
  // `older` is in creation order, so one cache at most stays: the newest that holds the page.
  const kept = held.lastIndexOf(true);
  return older.filter((_, index) => index !== kept);
}

/**
 * Whether a worker may delete the caches its activation kept: only once activated, and only with no
 * other version installing or waiting. Cache names are deterministic per commit, so a rollback's
 * new version can reuse a kept name; the next activation sweeps whatever this skips.
 */
export function mayDeleteRetainedCaches(
  state: ServiceWorkerState | undefined,
  registration: { installing: unknown; waiting: unknown },
): boolean {
  return state === "activated" && registration.installing === null && registration.waiting === null;
}

/**
 * In {@link OFFLINE_LOCALES_CACHE}: older versions' caches an activation kept for their home page.
 * Only these may be deleted later, outside an activation, since any other cache might belong to a
 * newer version that's installing.
 */
const RETAINED_CACHES_KEY = "/__retained-caches";

/** The older versions' caches the last activation kept; a corrupt record reads as none. */
export async function readRetainedCaches(cache: OfflineLocalesCache): Promise<string[]> {
  try {
    const response = await cache.match(RETAINED_CACHES_KEY);
    const names: unknown = await response?.json();
    return Array.isArray(names) ? names.filter((name) => typeof name === "string") : [];
  } catch {
    return [];
  }
}

export async function rememberRetainedCaches(
  cache: OfflineLocalesCache,
  names: readonly string[],
): Promise<void> {
  await cache.put(RETAINED_CACHES_KEY, Response.json(names));
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
  // Locale home pages are where an offline launch lands, so browsing can't push them out; there is
  // at most one per locale.
  const runtimeKeys = keys.filter((key) => {
    const url = new URL(key.url);
    return !assetPaths.has(url.pathname) && !isExternalFontAsset(url) && !isLocaleHome(url);
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
  await cache.put(request, stampSprite(response));
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
 *
 * A bare path (the manifest's `start_url` is `/`) has no page of its own: the server redirects it
 * to a locale. Offline, the worker does the same, redirecting to the last-used locale's cached
 * page (#728). It never caches a redirected navigation, which WebKit refuses to render.
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
    if (request.mode !== "navigate") return Response.error();
    return (await offlineLocaleRedirect(request, dependencies)) ?? dependencies.offlinePage();
  }
  const isNavigation = request.mode === "navigate";
  // A navigation answered with a followed redirect is a network error (its redirect mode is
  // "manual"), so hand the browser the redirect itself. It navigates again, and that response,
  // which isn't redirected, is the one cached. Chromium & current WebKit return an opaque redirect
  // here instead, which passes through untouched.
  if (isNavigation && response.redirected && response.url !== "") {
    return Response.redirect(response.url, 302);
  }
  if (!response.ok) return response;
  // Started now, so concurrent page loads record their locales in the order they arrived. Only a
  // full page load counts, not a preload of another locale's data; the page reports the rest.
  const locale = isNavigation ? localeOfPath(new URL(request.url).pathname) : undefined;
  const remembered = locale ? dependencies.lastLocale.remember(locale) : undefined;
  // Copied now: the caller consumes the body once this function returns.
  const copy = response.clone();
  dependencies.waitUntil(
    (async () => {
      try {
        await cacheRuntimeResponse(
          dependencies.cache,
          request,
          copy,
          dependencies.assetPaths,
          dependencies.maxEntries,
        );
      } catch {
        // Best-effort cache write: a failed write never affects the response.
      }
      await remembered;
    })(),
  );
  return response;
}

/**
 * A redirect from an uncached bare-path navigation to the same path under a locale whose page is
 * cached, trying the last-used locale first; `undefined` when there's nothing to redirect to. A
 * path's query is kept when that exact page is cached and dropped otherwise, so a `start_url`
 * that gains one (`/?source=pwa`) still finds the home page.
 */
async function offlineLocaleRedirect(
  request: Request,
  dependencies: RuntimeRequestDependencies,
): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (localeOfPath(url.pathname) || isUnlocalizedPath(url.pathname)) return undefined;
  const lastLocale = await dependencies.lastLocale.read();
  const locales = new Set([...(lastLocale ? [lastLocale] : []), ...LOCALE_CODES]);
  const rest = url.pathname === "/" ? "" : url.pathname;
  const targets = [...locales].flatMap((locale) => [
    new URL(`/${locale}${rest}${url.search}`, url).href,
    new URL(`/${locale}${rest}`, url).href,
  ]);
  for (const target of new Set(targets)) {
    // oxlint-disable-next-line no-await-in-loop -- Targets are tried in preference order.
    if (await dependencies.matchCache(target)) return Response.redirect(target, 302);
  }
  return undefined;
}

/** The locale a path is prefixed with, if any. */
function localeOfPath(pathname: string): LocaleCode | undefined {
  const segment = pathname.split("/")[1];
  return LOCALE_CODES.find((locale) => locale === segment);
}

/** A locale's home page (`/en`), without a query. */
function isLocaleHome(url: URL): boolean {
  return url.search === "" && LOCALE_CODES.some((locale) => url.pathname === `/${locale}`);
}

function isUnlocalizedPath(pathname: string): boolean {
  return UNLOCALIZED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Persists the last-used locale in `openCache`'s cache. Writes run one at a time in call order, so
 * the stored value is always the latest one remembered. Writes are best-effort and never reject; a
 * failed one is retried by the next call. Reads drop a corrupt or unknown record.
 *
 * Nothing is kept in memory: during an update, the active and the new version's worker each hold a
 * store over the same record, and either may write it (#18). Every read & write goes to the cache.
 */
export function lastLocaleStore(openCache: () => Promise<OfflineLocalesCache>): LastLocaleStore {
  let writes: Promise<void> = Promise.resolve();
  async function write(locale: LocaleCode, previous: Promise<void>): Promise<void> {
    await previous;
    try {
      const cache = await openCache();
      await cache.put(LAST_LOCALE_KEY, Response.json(locale));
    } catch {
      // Best-effort: the next call writes again.
    }
  }
  return {
    async read() {
      // After the writes this store started, so a read never misses its own latest locale.
      await writes;
      try {
        const cache = await openCache();
        const response = await cache.match(LAST_LOCALE_KEY);
        const stored: unknown = await response?.json();
        return LOCALE_CODES.find((locale) => locale === stored);
      } catch {
        // An unreadable or corrupt record reads as no record.
        return undefined;
      }
    },
    remember(locale) {
      writes = write(locale, writes);
      return writes;
    },
  };
}

/** Statuses that mean a sprite was withdrawn on purpose (a takedown), not that the network hiccuped. */
const WITHDRAWN_SPRITE_STATUSES: ReadonlySet<number> = new Set([403, 404, 410]);

/** A cached sprite younger than this (by its worker-set stamp) isn't revalidated on a hit. */
export const SPRITE_REVALIDATE_AFTER_MS = 24 * 60 * 60 * 1000;

/** Revalidations in flight, by sprite URL, so concurrent hits share one request & one outcome. */
const spriteRevalidations = new Map<string, Promise<void>>();

/**
 * Serves a sprite stale-while-revalidate. A cached copy returns at once, so sprites keep working
 * offline. Once its cached-at stamp is a day old (or missing), a background request revalidates it so
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

/**
 * Header recording when a sprite was cached. The worker stamps it itself because `Date` is not a
 * CORS-safelisted header, so a cross-origin sprite response doesn't expose it to script.
 */
export const SPRITE_CACHED_AT_HEADER = "x-sprite-cached-at";

/** A copy of `response` stamped with the current time; its body moves to the copy. */
function stampSprite(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set(SPRITE_CACHED_AT_HEADER, String(Date.now()));
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

/** Whether a cached sprite is due for revalidation; an unstamped (older) entry is, once. */
function isSpriteStale(cached: Response): boolean {
  const cachedAt = Number(cached.headers.get(SPRITE_CACHED_AT_HEADER));
  return !(Date.now() - cachedAt < SPRITE_REVALIDATE_AFTER_MS);
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

export type FetchStrategy = "asset" | "runtime" | "sprite";

/**
 * Which cache answers a request, or `undefined` when the worker should leave it to the browser.
 * Answering a request only to forward it gains nothing, and the worker would own every failure:
 * Safari reports each as a `respondWith` error, even for analytics beacons & extension fetches (#740).
 */
export function fetchStrategy(
  request: Pick<Request, "method" | "url">,
  assetPaths: ReadonlySet<string>,
  origin: string,
): FetchStrategy | undefined {
  if (request.method !== "GET") return undefined;
  const url = new URL(request.url);
  if (assetPaths.has(url.pathname)) return "asset";
  if (isExternalSpriteAsset(url)) return "sprite";
  if (isEligibleForRuntimeCaching(url, origin)) return "runtime";
  return undefined;
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
