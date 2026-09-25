import { beforeEach, describe, expect, it, vi } from "vitest";

const { goto, loadNames, setLocale } = vi.hoisted(() => ({
  goto: vi.fn(),
  loadNames: vi.fn(),
  setLocale: vi.fn(),
}));

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$app/state", () => ({ page: { url: new URL("https://mistria.fyi/ru/almanac") } }));
vi.mock("$lib/data/names", () => ({ loadNames }));
vi.mock("$lib/paraglide/runtime.js", () => ({
  deLocalizeHref: (pathname: string) => pathname.replace(/^\/[^/]+/, ""),
  localizeHref: (pathname: string, { locale }: { locale: string }) => `/${locale}${pathname}`,
  setLocale,
}));

import { localePreference } from "./locale-preference.svelte";

describe("localePreference", () => {
  beforeEach(() => {
    goto.mockReset();
    loadNames.mockReset().mockResolvedValue(undefined);
    setLocale.mockReset();
  });

  it("persists the locale without Paraglide's reload, then client-navigates to the same page", async () => {
    expect(await localePreference.select("ja")).toBe(true);

    expect(loadNames).toHaveBeenCalledWith("ja", ["ui"]);
    expect(setLocale).toHaveBeenCalledWith("ja", { reload: false });
    expect(goto).toHaveBeenCalledWith("/ja/almanac");
  });

  it("stays put when the locale's names can't be loaded (offline, not yet downloaded)", async () => {
    loadNames.mockRejectedValue(new TypeError("Failed to fetch dynamically imported module"));

    expect(await localePreference.select("zh-Hans")).toBe(false);

    expect(setLocale).not.toHaveBeenCalled();
    expect(goto).not.toHaveBeenCalled();
  });
});
