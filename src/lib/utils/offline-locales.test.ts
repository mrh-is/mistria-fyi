import { describe, expect, it, vi } from "vitest";

import { CACHE_LOCALES_MESSAGE } from "$lib/engine/service-worker-cache";

import { keepLocaleOffline } from "./offline-locales";

function container() {
  const postMessage = vi.fn();
  const ready = Promise.resolve({
    active: { postMessage },
  } as unknown as ServiceWorkerRegistration);
  return { postMessage, ready };
}

describe("keepLocaleOffline", () => {
  it("asks the active worker to cache the locale plus English for search", async () => {
    const { postMessage, ready } = container();

    keepLocaleOffline("ja", { ready });
    await ready;

    expect(postMessage).toHaveBeenCalledWith({
      type: CACHE_LOCALES_MESSAGE,
      locales: ["en", "ja"],
    });
  });

  it("asks for English once when English is the locale", async () => {
    const { postMessage, ready } = container();

    keepLocaleOffline("en", { ready });
    await ready;

    expect(postMessage).toHaveBeenCalledWith({ type: CACHE_LOCALES_MESSAGE, locales: ["en"] });
  });

  it("does nothing without service worker support", () => {
    expect(() => {
      keepLocaleOffline("ja");
    }).not.toThrow();
  });
});
