export const MAX_RUNTIME_ENTRIES = 50;

const EXTERNAL_RUNTIME_ASSETS = new Set(["https://assets.mistria.fyi/fonts/satoshi-regular.woff2"]);

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
  const runtimeKeys = keys.filter((key) => !assetPaths.includes(new URL(key.url).pathname));
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
  return (
    (url.origin === origin && !url.pathname.startsWith("/api/")) ||
    EXTERNAL_RUNTIME_ASSETS.has(url.href)
  );
}
