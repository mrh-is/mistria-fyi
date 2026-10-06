import { beforeAll, describe, expect, it } from "vitest";

import { getNameTable, loadNames, NAME_CHUNKS } from "#lib/data/names.js";
import { LOCALE_CODES } from "#lib/types/locale.js";

/**
 * The app fetches only the active locale's chunk per category — no English chunk rides along as a
 * runtime fallback. That is only safe because the pipeline English-fills every key the game
 * doesn't translate, so each locale's chunk set is key-identical to `en`'s. This guards that
 * contract on the generated data itself: a regression here would surface as a thrown `getName`
 * on a non-English route, not a quietly English name.
 */
describe("generated locale chunks", () => {
  beforeAll(async () => {
    await Promise.all(LOCALE_CODES.map((locale) => loadNames(locale, NAME_CHUNKS)));
  });

  const nonEnglishLocales = LOCALE_CODES.filter((locale) => locale !== "en");

  it.each(NAME_CHUNKS)("%s has identical keys in every locale", (category) => {
    const englishKeys = Object.keys(getNameTable(category, "en")).toSorted();
    expect(englishKeys.length).toBeGreaterThan(0);

    for (const locale of nonEnglishLocales) {
      expect(Object.keys(getNameTable(category, locale)).toSorted(), locale).toEqual(englishKeys);
    }
  });

  it.each(NAME_CHUNKS)("%s has a non-empty name for every key in every locale", (category) => {
    for (const locale of LOCALE_CODES) {
      for (const [id, name] of Object.entries(getNameTable(category, locale))) {
        expect(name.trim().length, `${locale}/${category}/${id}`).toBeGreaterThan(0);
      }
    }
  });
});
