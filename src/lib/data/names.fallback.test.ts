import { describe, expect, it, vi } from "vitest";

import type { NpcId } from "$lib/types/tracker-data.js";

/**
 * The pipeline English-fills every locale chunk, so a shipped chunk never misses a key and the
 * app has no runtime English fallback. Replacing the `ja` chunk with a partial one is the only way
 * to prove that a missing entry throws rather than quietly reading the English chunk, which would
 * be a regression back to fetching two chunks per category on every non-English route.
 */
vi.mock("$lib/data/locales/ja/npcs.json", () => ({ default: { balor: "バロル" } }));

const balor = "balor" as NpcId;
const adeline = "adeline" as NpcId;

describe("getName — no runtime English fallback", () => {
  it("throws on an entry missing from the locale chunk even when English has it", async () => {
    const { getName, getNameTable, hasNames, loadNames } = await import("$lib/data/names.js");
    await loadNames("ja", ["npcs"]);
    await loadNames("en", ["npcs"]);

    expect(getName("npcs", balor, "ja")).toBe("バロル");
    expect(getName("npcs", adeline, "en")).toBe("Adeline");
    expect(() => getName("npcs", adeline, "ja")).toThrow(/No "npcs" name for id "adeline"/);

    expect(hasNames("ja", ["npcs"])).toBe(true);
    expect(getNameTable("npcs", "ja")).toEqual({ balor: "バロル" });
  });
});
