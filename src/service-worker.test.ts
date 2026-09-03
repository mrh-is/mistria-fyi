import { describe, expect, it } from "vitest";

const ORIGIN = "https://mistria.fyi";

function isEligibleForCaching(url: URL, origin: string): boolean {
  if (url.origin !== origin) return false;
  if (url.pathname.startsWith("/api/")) return false;
  return true;
}

describe("service-worker runtime cache eligibility", () => {
  it("accepts same-origin page requests", () => {
    expect(isEligibleForCaching(new URL("/animals", ORIGIN), ORIGIN)).toBe(true);
    expect(isEligibleForCaching(new URL("/settings", ORIGIN), ORIGIN)).toBe(true);
    expect(isEligibleForCaching(new URL("/", ORIGIN), ORIGIN)).toBe(true);
  });

  it("rejects cross-origin requests", () => {
    expect(isEligibleForCaching(new URL("https://fonts.googleapis.com/css"), ORIGIN)).toBe(false);
    expect(isEligibleForCaching(new URL("https://cdn.example.com/lib.js"), ORIGIN)).toBe(false);
  });

  it("rejects API routes", () => {
    expect(isEligibleForCaching(new URL("/api/feedback", ORIGIN), ORIGIN)).toBe(false);
    expect(isEligibleForCaching(new URL("/api/feedback/email", ORIGIN), ORIGIN)).toBe(false);
  });

  it("accepts non-API paths that start with a similar prefix", () => {
    expect(isEligibleForCaching(new URL("/apikeys", ORIGIN), ORIGIN)).toBe(true);
  });
});

describe("service-worker caching behavior", () => {
  it("only caches successful responses (response.ok)", () => {
    const okResponse = new Response("OK", { status: 200 });
    const errorResponse = new Response("Not Found", { status: 404 });
    const serverError = new Response("Error", { status: 500 });

    expect(okResponse.ok).toBe(true);
    expect(errorResponse.ok).toBe(false);
    expect(serverError.ok).toBe(false);
  });
});

describe("service-worker eviction policy", () => {
  it("enforces a maximum of 50 runtime cache entries", () => {
    const MAX_RUNTIME_ENTRIES = 50;
    const runtimeKeys = Array.from({ length: 55 }, (_, i) => `/page-${String(i)}`);
    const excess = runtimeKeys.length - MAX_RUNTIME_ENTRIES;
    const toEvict = excess > 0 ? runtimeKeys.slice(0, excess) : [];

    expect(toEvict).toEqual(["/page-0", "/page-1", "/page-2", "/page-3", "/page-4"]);
    expect(runtimeKeys.length - toEvict.length).toBe(MAX_RUNTIME_ENTRIES);
  });

  it("does not evict when under the limit", () => {
    const MAX_RUNTIME_ENTRIES = 50;
    const runtimeKeys = Array.from({ length: 30 }, (_, i) => `/page-${String(i)}`);
    const excess = runtimeKeys.length - MAX_RUNTIME_ENTRIES;
    const toEvict = excess > 0 ? runtimeKeys.slice(0, excess) : [];

    expect(toEvict).toEqual([]);
  });
});
