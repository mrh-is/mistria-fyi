import { afterEach, describe, expect, it, vi } from "vitest";

import { trySetItem } from "#lib/utils/local-storage.js";

describe("trySetItem", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns true on successful write", () => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", {
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
    });

    expect(trySetItem("test-key", "test-value")).toBe(true);
    expect(store["test-key"]).toBe("test-value");
  });

  it("returns false when storage throws (blocked access)", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new DOMException("Access denied", "SecurityError");
      },
    });

    expect(trySetItem("test-key", "value")).toBe(false);
  });

  it("returns false when storage throws (quota exceeded)", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
    });

    expect(trySetItem("test-key", "value")).toBe(false);
  });
});
