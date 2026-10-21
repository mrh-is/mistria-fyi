/**
 * Which app version each open page runs, so a service worker can activate as soon as it installs
 * and still keep every older version's cache that an open page imports from (#111).
 *
 * Pages report their version on load; the worker keeps the reports in a version-independent cache,
 * since the worker that hears a report is rarely the one that later deletes caches.
 */

/** Page → service worker: “this page runs `version`”. Sent on every page load. */
export const CLIENT_VERSION_MESSAGE = "mfg:client-version";

export interface ClientVersionMessage {
  type: typeof CLIENT_VERSION_MESSAGE;
  version: string;
}

/** Persists across versions: the version each open page reported, keyed by client ID. */
export const CLIENT_VERSIONS_CACHE = "client-versions-v1";
const CLIENT_VERSIONS_KEY = "/__client-versions";

/** Versions are short build labels (`2026.10.20 (e4dd053a)`); anything else isn't trusted. */
const MAX_VERSION_LENGTH = 100;

type ClientVersionsCache = Pick<Cache, "match" | "put">;

/** The version a client-version message reports, or `undefined` for any other message. */
export function parseClientVersionMessage(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null) return undefined;
  const { type, version } = data as Partial<ClientVersionMessage>;
  if (type !== CLIENT_VERSION_MESSAGE || typeof version !== "string") return undefined;
  return version !== "" && version.length <= MAX_VERSION_LENGTH ? version : undefined;
}

/** The recorded client versions; a missing or corrupt record reads as none. */
export async function readClientVersions(
  cache: Pick<Cache, "match">,
): Promise<Record<string, string>> {
  try {
    const response = await cache.match(CLIENT_VERSIONS_KEY);
    const record: unknown = await response?.json();
    if (typeof record !== "object" || record === null || Array.isArray(record)) return {};
    return Object.fromEntries(
      Object.entries(record).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

/**
 * Records that `clientId` runs `version`, dropping clients that are no longer open so the record
 * stays as small as the set of open pages.
 */
export async function rememberClientVersion(
  cache: ClientVersionsCache,
  clientId: string,
  version: string,
  openClientIds: ReadonlySet<string>,
): Promise<void> {
  const record = await readClientVersions(cache);
  const kept = Object.fromEntries(Object.entries(record).filter(([id]) => openClientIds.has(id)));
  kept[clientId] = version;
  await cache.put(CLIENT_VERSIONS_KEY, Response.json(kept));
}

export interface VersionsInUse {
  /**
   * Whether any open page hasn't reported its version: one still loading, or one from a release
   * before pages reported. Its version could be any, so no older cache is safe to delete yet.
   */
  unknown: boolean;
  versions: ReadonlySet<string>;
}

/** The versions the open pages run, from the recorded reports. */
export function versionsInUse(
  record: Readonly<Record<string, string>>,
  openClientIds: Iterable<string>,
): VersionsInUse {
  const versions = new Set<string>();
  let unknown = false;
  for (const id of openClientIds) {
    if (Object.hasOwn(record, id)) versions.add(record[id]);
    else unknown = true;
  }
  return { unknown, versions };
}

/**
 * Which of the `older` caches no open page needs: all of them when every open page runs a version
 * whose cache isn't among them, and none while any page's version is unknown. `cacheName` maps a
 * version to its cache's name.
 */
export function cachesNoPageNeeds(
  older: readonly string[],
  inUse: VersionsInUse,
  cacheName: (version: string) => string,
): string[] {
  if (inUse.unknown) return [];
  const needed = new Set([...inUse.versions].map((version) => cacheName(version)));
  return older.filter((name) => !needed.has(name));
}
