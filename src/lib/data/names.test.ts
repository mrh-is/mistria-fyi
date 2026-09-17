import { describe, expect, it } from "vitest";

import { trackerData } from "$lib/data/index.js";
import { getName, getNameTable, nameCollator } from "$lib/data/names.js";
import { LOCALE_CODES } from "$lib/types/locale.js";
import { recordKeys } from "$lib/utils.js";

import type { NpcId } from "$lib/types/tracker-data.js";

const balor = "balor" as NpcId;

describe("getName", () => {
  it("resolves the localized name for a translated locale", () => {
    expect(getName("npcs", balor, "en")).toBe("Balor");
    expect(getName("npcs", balor, "ja")).toBe("バロル");
  });

  it("resolves every NPC in every locale", () => {
    for (const id of recordKeys(trackerData.npcs)) {
      for (const locale of LOCALE_CODES) {
        expect(getName("npcs", id, locale).length, `${id}/${locale}`).toBeGreaterThan(0);
      }
    }
  });

  // The locale-missing → English fallback path lives in `names.fallback.test.ts`, which needs a
  // partial chunk the pipeline never emits.
  it("throws rather than inventing a name when not even English has the ID", () => {
    expect(() => getName("npcs", "not_a_real_npc", "ja")).toThrow(/No "npcs" name/);
    expect(() => getName("npcs", "not_a_real_npc", "en")).toThrow(/en fallback/);
  });

  it("gives independent results for two locales interleaved in one process", () => {
    // Simulates concurrent SSR requests in different locales sharing one module instance: the
    // guard against any ambient "current locale" being reintroduced under `getName`.
    const ids = recordKeys(trackerData.npcs).slice(0, 10);
    const pairs = ids.flatMap((id) => [
      { expected: getNameTable("npcs", "en")[id], id, locale: "en" as const },
      { expected: getNameTable("npcs", "ja")[id], id, locale: "ja" as const },
    ]);

    // Interleaved, then reversed, then shuffled — order must never change any single answer.
    for (const order of [pairs, [...pairs].reverse(), [...pairs].sort(() => 0.5 - Math.random())]) {
      for (const { expected, id, locale } of order) {
        expect(getName("npcs", id, locale)).toBe(expected);
      }
    }

    // And at least one of the sampled NPCs must actually differ between the two locales, so the
    // assertion above can't pass trivially on identical tables.
    expect(ids.some((id) => getName("npcs", id, "en") !== getName("npcs", id, "ja"))).toBe(true);
  });

  it("resolves concurrently from independently-awaited tasks", async () => {
    const ids = recordKeys(trackerData.npcs);
    const [english, japanese] = await Promise.all([
      Promise.resolve().then(() => ids.map((id) => getName("npcs", id, "en"))),
      Promise.resolve().then(() => ids.map((id) => getName("npcs", id, "ja"))),
    ]);

    expect(english).toStrictEqual(ids.map((id) => getNameTable("npcs", "en")[id]));
    expect(japanese).toStrictEqual(ids.map((id) => getNameTable("npcs", "ja")[id]));
    expect(english).not.toStrictEqual(japanese);
  });
});

describe("getNameTable", () => {
  it("merges the English chunk under the requested locale", () => {
    const table = getNameTable("npcs", "ja");
    expect(Object.keys(table).sort()).toStrictEqual([...recordKeys(trackerData.npcs)].sort());
    expect(table[balor]).toBe("バロル");
  });

  it("returns the English chunk unchanged for en", () => {
    expect(getNameTable("npcs", "en")[balor]).toBe("Balor");
  });
});

describe("nameCollator", () => {
  it("sorts with the requested locale's collation and memoizes per locale", () => {
    expect(nameCollator("en")).toBe(nameCollator("en"));
    expect(nameCollator("ja")).not.toBe(nameCollator("en"));
    expect(nameCollator("en").compare("Adeline", "Balor")).toBeLessThan(0);
  });
});
