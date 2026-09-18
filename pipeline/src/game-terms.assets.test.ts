import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { findGameTermDrift, readGameTermsConfig, resolveGameTerms } from "./game-terms.js";
import { requireGameAssetsDir } from "./test-helpers.js";

const MESSAGES_DIR = resolve(import.meta.dirname, "..", "..", "messages");

describe("game terms — real assets", () => {
  it("every mapped Paraglide message carries the game's own string in every locale", () => {
    const { terms } = readGameTermsConfig(MESSAGES_DIR);
    const values = resolveGameTerms(requireGameAssetsDir(), terms);

    // Drift means messages/<locale>.json was edited by hand or the game assets changed;
    // `pnpm run i18n:sync-game-terms` brings them back in step.
    expect(findGameTermDrift(MESSAGES_DIR, values)).toEqual([]);
  });

  it("pins the terms the audit chose from the game's vocabulary", () => {
    const { terms } = readGameTermsConfig(MESSAGES_DIR);
    const values = resolveGameTerms(requireGameAssetsDir(), terms);

    expect(values.en.category_almanac_name).toBe("The Almanac");
    expect(values.ja.category_almanac_name).toBe("図鑑");
    expect(values.en.quest_type_crown).toBe("Crown Requests");
    expect(values.ru.category_renown_name).toBe("Репутация");
  });
});
