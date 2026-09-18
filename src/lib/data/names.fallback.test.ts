import { describe, expect, it, vi } from "vitest";

import type { VillagerId } from "$lib/types/tracker-data.js";

/**
 * The pipeline English-fills every locale chunk, so a shipped chunk never misses a key and the
 * app has no runtime English fallback. Replacing the `ja` chunk with a partial one is the only way
 * to prove that a missing entry throws rather than quietly reading the English chunk, which would
 * be a regression back to fetching two chunks per category on every non-English route.
 */
vi.mock("$lib/data/locales/ja/villagers.json", () => ({ default: { balor: "バロル" } }));

const balor = "balor" as VillagerId;
const adeline = "adeline" as VillagerId;

describe("getName — no runtime English fallback", () => {
  it("throws on an entry missing from the locale chunk even when English has it", async () => {
    const { getName, getNameTable, hasNames, loadNames } = await import("$lib/data/names.js");
    await loadNames("ja", ["villagers"]);
    await loadNames("en", ["villagers"]);

    expect(getName("villagers", balor, "ja")).toBe("バロル");
    expect(getName("villagers", adeline, "en")).toBe("Adeline");
    expect(() => getName("villagers", adeline, "ja")).toThrow(
      /No "villagers" name for id "adeline"/,
    );

    expect(hasNames("ja", ["villagers"])).toBe(true);
    expect(getNameTable("villagers", "ja")).toEqual({ balor: "バロル" });
  });
});
