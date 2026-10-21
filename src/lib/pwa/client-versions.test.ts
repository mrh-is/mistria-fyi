import { describe, expect, it } from "vitest";

import {
  cachesNoPageNeeds,
  CLIENT_VERSION_MESSAGE,
  parseClientVersionMessage,
  readClientVersions,
  rememberClientVersion,
  versionsInUse,
} from "./client-versions.js";

function keyOf(key: RequestInfo | URL): string {
  if (typeof key === "string") return key;
  return key instanceof URL ? key.href : key.url;
}

function fakeCache() {
  const entries = new Map<string, Response>();
  return {
    entries,
    match: (key: RequestInfo | URL) => Promise.resolve(entries.get(keyOf(key))?.clone()),
    put: (key: RequestInfo | URL, response: Response) => {
      entries.set(keyOf(key), response);
      return Promise.resolve();
    },
  };
}

const cacheName = (version: string) => `cache-${version}`;

describe("parseClientVersionMessage", () => {
  it("reads a page's reported version", () => {
    expect(parseClientVersionMessage({ type: CLIENT_VERSION_MESSAGE, version: "v2" })).toBe("v2");
  });

  it.each([
    null,
    "mfg:client-version",
    { type: "mfg:cache-locales", version: "v2" },
    { type: CLIENT_VERSION_MESSAGE },
    { type: CLIENT_VERSION_MESSAGE, version: 2 },
    { type: CLIENT_VERSION_MESSAGE, version: "" },
    { type: CLIENT_VERSION_MESSAGE, version: "x".repeat(101) },
  ])("ignores %j", (data) => {
    expect(parseClientVersionMessage(data)).toBeUndefined();
  });
});

describe("client version record", () => {
  it("records each open page's version and forgets closed pages", async () => {
    const cache = fakeCache();
    await rememberClientVersion(cache, "a", "v1", new Set(["a"]));
    await rememberClientVersion(cache, "b", "v2", new Set(["a", "b"]));
    expect(await readClientVersions(cache)).toEqual({ a: "v1", b: "v2" });

    await rememberClientVersion(cache, "c", "v2", new Set(["b", "c"]));
    expect(await readClientVersions(cache)).toEqual({ b: "v2", c: "v2" });
  });

  it("updates a page that reports a new version after reloading", async () => {
    const cache = fakeCache();
    await rememberClientVersion(cache, "a", "v1", new Set(["a"]));
    await rememberClientVersion(cache, "a", "v2", new Set(["a"]));
    expect(await readClientVersions(cache)).toEqual({ a: "v2" });
  });

  it("reads a missing or corrupt record as none", async () => {
    const cache = fakeCache();
    expect(await readClientVersions(cache)).toEqual({});
    await cache.put("/__client-versions", new Response("not json"));
    expect(await readClientVersions(cache)).toEqual({});
    await cache.put("/__client-versions", Response.json(["v1"]));
    expect(await readClientVersions(cache)).toEqual({});
    await cache.put("/__client-versions", Response.json({ a: "v1", b: 2 }));
    expect(await readClientVersions(cache)).toEqual({ a: "v1" });
  });
});

describe("cachesNoPageNeeds", () => {
  const older = ["cache-v1", "cache-v2"];

  it("keeps the cache of every version an open page runs", () => {
    const inUse = versionsInUse({ a: "v1", b: "v3" }, ["a", "b"]);
    expect(cachesNoPageNeeds(older, inUse, cacheName)).toEqual(["cache-v2"]);
  });

  it("frees every older cache once no open page runs its version", () => {
    const inUse = versionsInUse({ a: "v1", b: "v3" }, ["b"]);
    expect(cachesNoPageNeeds(older, inUse, cacheName)).toEqual(older);
    expect(cachesNoPageNeeds(older, versionsInUse({}, []), cacheName)).toEqual(older);
  });

  it("keeps everything while an open page hasn't reported its version", () => {
    const inUse = versionsInUse({ a: "v3" }, ["a", "unreported"]);
    expect(inUse.unknown).toBe(true);
    expect(cachesNoPageNeeds(older, inUse, cacheName)).toEqual([]);
  });
});
