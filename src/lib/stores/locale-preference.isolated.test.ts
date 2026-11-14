import { beforeEach, describe, expect, it, vi } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

import { localePreference } from "./locale-preference.svelte.js";

const { ensureLocaleCachedOffline, goto, rememberLocale } = vi.hoisted(() => ({
  ensureLocaleCachedOffline: vi.fn<(locale: string) => Promise<boolean | undefined>>(),
  goto: vi.fn(),
  rememberLocale: vi.fn(),
}));

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));
vi.mock("#lib/i18n/locale-runtime.js", () => ({ rememberLocale }));
vi.mock("#lib/pwa/offline-locales.js", () => ({ ensureLocaleCachedOffline }));

describe("localePreference", () => {
  beforeEach(() => {
    pageStub.reset();
    pageStub.navigate("/ru/almanac");
    goto.mockReset();
    ensureLocaleCachedOffline.mockReset().mockResolvedValue(true);
    rememberLocale.mockReset();
  });

  it("persists the locale and client-navigates to the same page", async () => {
    expect(await localePreference.select("ja")).toBe(true);

    expect(ensureLocaleCachedOffline).toHaveBeenCalledWith("ja");
    expect(rememberLocale).toHaveBeenCalledWith("ja");
    expect(goto).toHaveBeenCalledWith("/ja/almanac");
  });

  it("stays put when the locale can't be fully downloaded (offline, not yet cached)", async () => {
    ensureLocaleCachedOffline.mockResolvedValue(false);

    expect(await localePreference.select("zh-Hans")).toBe(false);

    expect(rememberLocale).not.toHaveBeenCalled();
    expect(goto).not.toHaveBeenCalled();
  });

  it("switches without a service worker, which has no offline cache to consult", async () => {
    ensureLocaleCachedOffline.mockResolvedValue(undefined);

    expect(await localePreference.select("ko")).toBe(true);

    expect(goto).toHaveBeenCalledWith("/ko/almanac");
  });
});
