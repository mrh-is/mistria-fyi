import { describe, expect, it } from "vitest";

import { memoryStorage } from "./memory-storage.js";

describe("memoryStorage", () => {
  it("reads seeded entries and round-trips writes", () => {
    const storage = memoryStorage({ seeded: "1" });
    storage.setItem("written", "2");

    expect(storage.getItem("seeded")).toBe("1");
    expect(storage.getItem("written")).toBe("2");
    expect(storage.getItem("missing")).toBeNull();
    expect(storage).toHaveLength(2);
    expect(storage.key(1)).toBe("written");
  });

  it("removes and clears entries", () => {
    const storage = memoryStorage({ first: "1", second: "2" });
    storage.removeItem("first");
    expect(storage.getItem("first")).toBeNull();

    storage.clear();
    expect(storage).toHaveLength(0);
  });

  it("keeps each instance's entries separate", () => {
    memoryStorage().setItem("shared", "1");
    expect(memoryStorage().getItem("shared")).toBeNull();
  });
});
