import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

function runBootstrap(doc: Document): void {
  let t: null | string;
  try {
    t = localStorage.getItem("mistria-fyi-theme");
  } catch {
    t = null;
  }
  t = t ?? "system";
  const dark =
    t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) {
    doc.documentElement.classList.add("dark");
  }
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
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("applies dark class when stored preference is dark", () => {
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-theme": "dark" }));
    runBootstrap(document);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("does not apply dark class when stored preference is light", () => {
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-theme": "light" }));
    runBootstrap(document);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("follows OS preference when stored preference is system and OS prefers dark", () => {
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-theme": "system" }));
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    runBootstrap(document);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("follows OS preference when stored preference is system and OS prefers light", () => {
    vi.stubGlobal("localStorage", makeStorage({ "mistria-fyi-theme": "system" }));
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    runBootstrap(document);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("falls back to system when no preference is stored", () => {
    vi.stubGlobal("localStorage", makeStorage());
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    runBootstrap(document);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("falls back to system when localStorage.getItem throws", () => {
    vi.stubGlobal("localStorage", throwingStorage());
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    runBootstrap(document);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("does not apply dark class when localStorage throws and OS prefers light", () => {
    vi.stubGlobal("localStorage", throwingStorage());
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    runBootstrap(document);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
