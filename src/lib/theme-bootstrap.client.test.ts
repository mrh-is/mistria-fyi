import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Extract the two inline <script> blocks from app.html and evaluate them
// directly, so tests exercise the production code rather than a reimplemented
// copy that could drift.
const appHtml = readFileSync(resolve(__dirname, "../app.html"), "utf-8");

const scriptBlocks = [...appHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const themeBootstrapScript = scriptBlocks[0];
const themeColorScript = scriptBlocks[1];

function makeStorage(data: Record<string, string> = {}): Storage {
  const store = new Map(Object.entries(data));
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key: string) => store.delete(key),
    setItem: (key: string, value: string) => store.set(key, value),
  };
}

function runBootstrap(): void {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  new Function(themeBootstrapScript)();
}

function runThemeColorSync(): void {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  new Function(themeColorScript)();
}

function throwingStorage(): Storage {
  return {
    clear: () => {
      throw new DOMException("Storage access denied", "SecurityError");
    },
    getItem: () => {
      throw new DOMException("Storage access denied", "SecurityError");
    },
    key: () => {
      throw new DOMException("Storage access denied", "SecurityError");
    },
    get length(): number {
      throw new DOMException("Storage access denied", "SecurityError");
    },
    removeItem: () => {
      throw new DOMException("Storage access denied", "SecurityError");
    },
    setItem: () => {
      throw new DOMException("Storage access denied", "SecurityError");
    },
  };
}

describe("theme bootstrap", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    // Ensure a theme-color meta tag exists, as it does in production app.html
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = "#f8f5ef";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("extracts both inline scripts from app.html", () => {
    expect(themeBootstrapScript).toContain("localStorage");
    expect(themeColorScript).toContain("theme-color");
  });

  it("applies dark class when stored preference is dark", () => {
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-theme": "dark" }));
    runBootstrap();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("does not apply dark class when stored preference is light", () => {
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-theme": "light" }));
    runBootstrap();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("follows OS preference when stored preference is system and OS prefers dark", () => {
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-theme": "system" }));
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    runBootstrap();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("follows OS preference when stored preference is system and OS prefers light", () => {
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-theme": "system" }));
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    runBootstrap();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("falls back to system when no preference is stored", () => {
    vi.stubGlobal("localStorage", makeStorage());
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    runBootstrap();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("falls back to system when localStorage.getItem throws", () => {
    vi.stubGlobal("localStorage", throwingStorage());
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    runBootstrap();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("does not apply dark class when localStorage throws and OS prefers light", () => {
    vi.stubGlobal("localStorage", throwingStorage());
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    runBootstrap();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("theme-color sync", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = "#f8f5ef";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sets dark theme-color when bootstrap applied dark class", () => {
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-theme": "dark" }));
    runBootstrap();
    runThemeColorSync();

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta).toBeDefined();
    expect(meta?.content).toBe("#011011");
  });

  it("preserves light theme-color when bootstrap did not apply dark class", () => {
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-theme": "light" }));
    runBootstrap();
    runThemeColorSync();

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta).toBeDefined();
    expect(meta?.content).toBe("#f8f5ef");
  });

  it("sets dark theme-color when localStorage throws and OS prefers dark", () => {
    vi.stubGlobal("localStorage", throwingStorage());
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    runBootstrap();
    runThemeColorSync();

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta).toBeDefined();
    expect(meta?.content).toBe("#011011");
  });

  it("preserves light theme-color when localStorage throws and OS prefers light", () => {
    vi.stubGlobal("localStorage", throwingStorage());
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    runBootstrap();
    runThemeColorSync();

    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    expect(meta).toBeDefined();
    expect(meta?.content).toBe("#f8f5ef");
  });
});
