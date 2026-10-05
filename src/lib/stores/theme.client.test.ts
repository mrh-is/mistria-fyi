import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_COLORS, THEME_STORAGE_KEY } from "#lib/theme.js";

/** A `prefers-color-scheme: dark` query whose answer a test can flip, as the OS would. */
class FakeColorSchemeQuery extends EventTarget {
  matches = false;
  readonly media = "(prefers-color-scheme: dark)";

  flip(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(new Event("change"));
  }
}

let query: FakeColorSchemeQuery;
let flushSync: () => void;

/** Loads a fresh store, with the Svelte runtime instance that store uses. */
async function loadStore() {
  vi.resetModules();
  ({ flushSync } = await import("svelte"));
  const { theme } = await import("./theme.svelte");
  flushSync();
  return theme;
}

function themeColor(): null | string {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? null;
}

describe("theme store", () => {
  beforeEach(() => {
    query = new FakeColorSchemeQuery();
    vi.spyOn(globalThis, "matchMedia").mockReturnValue(query as unknown as MediaQueryList);
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = THEME_COLORS.light;
    document.head.replaceChildren(meta);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("follows OS theme changes in system mode", async () => {
    const theme = await loadStore();
    expect(theme.resolved).toBe("light");

    query.flip(true);
    flushSync();

    expect(theme.resolved).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(themeColor()).toBe(THEME_COLORS.dark);

    query.flip(false);
    flushSync();

    expect(theme.resolved).toBe("light");
    expect(themeColor()).toBe(THEME_COLORS.light);
  });

  it("ignores OS theme changes under an explicit preference", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    const theme = await loadStore();

    query.flip(true);
    flushSync();

    expect(theme.resolved).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
