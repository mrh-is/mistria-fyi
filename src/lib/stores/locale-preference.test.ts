import { beforeEach, describe, expect, it, vi } from "vitest";

const { goto, setLocale } = vi.hoisted(() => ({ goto: vi.fn(), setLocale: vi.fn() }));

vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$app/state", () => ({ page: { url: new URL("https://mistria.fyi/ru/almanac") } }));
vi.mock("$lib/paraglide/runtime.js", () => ({
  deLocalizeHref: (pathname: string) => pathname.replace(/^\/[^/]+/, ""),
  localizeHref: (pathname: string, { locale }: { locale: string }) => `/${locale}${pathname}`,
  setLocale,
}));

import { localePreference } from "./locale-preference.svelte";

describe("localePreference", () => {
  beforeEach(() => {
    goto.mockReset();
    setLocale.mockReset();
  });

  it("persists the locale without Paraglide's reload, then client-navigates to the same page", () => {
    localePreference.select("ja");

    expect(setLocale).toHaveBeenCalledWith("ja", { reload: false });
    expect(goto).toHaveBeenCalledWith("/ja/almanac");
  });
});
