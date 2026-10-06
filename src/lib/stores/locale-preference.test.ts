import { beforeEach, describe, expect, it, vi } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

import { localePreference } from "./locale-preference.svelte.js";

const { downloadLocale, goto, setLocale } = vi.hoisted(() => ({
  downloadLocale: vi.fn<(locale: string) => Promise<boolean | undefined>>(),
  goto: vi.fn(),
  setLocale: vi.fn(),
}));

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));
vi.mock("#lib/paraglide/runtime.js", () => ({
  deLocalizeHref: (pathname: string) => pathname.replace(/^\/[^/]+/, ""),
  localizeHref: (pathname: string, { locale }: { locale: string }) => `/${locale}${pathname}`,
  setLocale,
}));
vi.mock("#lib/pwa/offline-locales.js", () => ({ downloadLocale }));

describe("localePreference", () => {
  beforeEach(() => {
    pageStub.reset();
    pageStub.navigate("/ru/almanac");
    goto.mockReset();
    downloadLocale.mockReset().mockResolvedValue(true);
    setLocale.mockReset();
  });

  it("persists the locale without Paraglide's reload, then client-navigates to the same page", async () => {
    expect(await localePreference.select("ja")).toBe(true);

    expect(downloadLocale).toHaveBeenCalledWith("ja");
    expect(setLocale).toHaveBeenCalledWith("ja", { reload: false });
    expect(goto).toHaveBeenCalledWith("/ja/almanac");
  });

  it("stays put when the locale can't be fully downloaded (offline, not yet cached)", async () => {
    downloadLocale.mockResolvedValue(false);

    expect(await localePreference.select("zh-Hans")).toBe(false);

    expect(setLocale).not.toHaveBeenCalled();
    expect(goto).not.toHaveBeenCalled();
  });

  it("switches without a service worker, which has no offline cache to consult", async () => {
    downloadLocale.mockResolvedValue(undefined);

    expect(await localePreference.select("ko")).toBe(true);

    expect(goto).toHaveBeenCalledWith("/ko/almanac");
  });
});
