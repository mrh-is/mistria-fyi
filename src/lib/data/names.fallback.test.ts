import { describe, expect, it, vi } from "vitest";

import type { NpcId } from "$lib/types/tracker-data.js";

/**
 * The generated chunks are English-filled by the pipeline, so a shipped beta locale never actually
 * misses a key. Replacing the `ja` chunk with a partial one exercises the app-side fallback that
 * would otherwise be unreachable: a locale chunk that exists but has no entry for the requested ID.
 */
vi.mock("$lib/data/locales/ja/npcs.json", () => ({ default: { balor: "バロル" } }));

const balor = "balor" as NpcId;
const adeline = "adeline" as NpcId;

describe("getName — English fallback", () => {
  it("uses the locale's entry when present and English when it is missing", async () => {
    // `vitest.config.ts` runs with `isolate: false`, so the module registry is shared across
    // test files in a worker. Another file may have already imported `names.js` (evaluating its
    // eager `import.meta.glob` against the real, unmocked chunk) before this mock was registered;
    // resetting forces a fresh evaluation that picks up the mock above.
    vi.resetModules();
    const { getName, getNameTable } = await import("$lib/data/names.js");

    expect(getName("npcs", balor, "ja")).toBe("バロル");
    expect(getName("npcs", adeline, "ja")).toBe("Adeline");
    expect(getName("npcs", adeline, "en")).toBe("Adeline");

    const table = getNameTable("npcs", "ja");
    expect(table[balor]).toBe("バロル");
    expect(table[adeline]).toBe("Adeline");
  });
});
