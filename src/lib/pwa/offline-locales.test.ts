import { describe, expect, it, vi } from "vitest";

import { CACHE_LOCALES_MESSAGE } from "#lib/pwa/service-worker-cache.js";

import { ensureLocaleCachedOffline, keepLocaleOffline } from "./offline-locales.js";

function container() {
  const postMessage = vi.fn();
  const ready = Promise.resolve({
    active: { postMessage },
  } as unknown as ServiceWorkerRegistration);
  return { postMessage, ready };
}

describe("keepLocaleOffline", () => {
  it("asks the active worker to cache the locale plus English for search, naming the current one", async () => {
    const { postMessage, ready } = container();

    keepLocaleOffline("ja", { ready });
    await ready;

    expect(postMessage).toHaveBeenCalledWith({
      type: CACHE_LOCALES_MESSAGE,
      current: "ja",
      locales: ["en", "ja"],
    });
  });

  it("asks for English once when English is the locale", async () => {
    const { postMessage, ready } = container();

    keepLocaleOffline("en", { ready });
    await ready;

    expect(postMessage).toHaveBeenCalledWith({
      type: CACHE_LOCALES_MESSAGE,
      current: "en",
      locales: ["en"],
    });
  });

  it("also asks a new version installing or waiting to take over", async () => {
    const active = vi.fn();
    const installing = vi.fn();
    const waiting = vi.fn();
    const ready = Promise.resolve({
      active: { postMessage: active },
      installing: { postMessage: installing },
      waiting: { postMessage: waiting },
    } as unknown as ServiceWorkerRegistration);

    keepLocaleOffline("ja", { ready });
    await ready;

    const message = { type: CACHE_LOCALES_MESSAGE, current: "ja", locales: ["en", "ja"] };
    expect(active).toHaveBeenCalledWith(message);
    // An installing version may already have read the previous locale (#18).
    expect(installing).toHaveBeenCalledWith(message);
    expect(waiting).toHaveBeenCalledWith(message);
  });

  it("does nothing without service worker support", () => {
    expect(() => {
      keepLocaleOffline("ja");
    }).not.toThrow();
  });
});

function controller(reply?: (data: unknown) => { failed: string[] }) {
  const postMessage = vi.fn((data: unknown, [port]: [MessagePort]) => {
    if (reply) port.postMessage(reply(data));
  });
  return { controller: { postMessage } as unknown as ServiceWorker, postMessage };
}

describe("ensureLocaleCachedOffline", () => {
  it("asks the controlling worker to cache just that locale", async () => {
    const { controller: worker, postMessage } = controller(() => ({ failed: [] }));

    expect(await ensureLocaleCachedOffline("ja", { controller: worker })).toBe(true);

    expect(postMessage).toHaveBeenCalledWith({ type: CACHE_LOCALES_MESSAGE, locales: ["ja"] }, [
      expect.any(MessagePort),
    ]);
  });

  it("reports a partly cached locale as unavailable", async () => {
    const { controller: worker } = controller(() => ({
      failed: ["/_app/immutable/chunks/ja-a.js"],
    }));

    expect(await ensureLocaleCachedOffline("ja", { controller: worker })).toBe(false);
  });

  it("reports the locale unavailable when the worker never answers", async () => {
    const { controller: worker } = controller();

    expect(await ensureLocaleCachedOffline("ja", { controller: worker }, 10)).toBe(false);
  });

  it("has no answer without a controlling worker", async () => {
    expect(await ensureLocaleCachedOffline("ja", { controller: null })).toBeUndefined();
  });
});
