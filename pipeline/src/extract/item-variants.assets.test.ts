import { describe, expect, it, vi } from "vitest";

import acquisitionCatalog from "#lib/i18n/catalogs/acquisition.json" with { type: "json" };
import { LOCALE_CODES } from "#lib/types/locale.js";
import { ITEM_VARIANTS } from "#lib/types/tracker-data.js";

import { forEachItem } from "../extractor-helpers.js";
import { createAssetsLocalizer } from "../localize/localize.js";
import { ITEM_VARIANT_TERMS } from "../overrides/item-variant-terms.js";
import { ITEM_VARIANT_SETS } from "../overrides/item-variants.js";
import { evaluateExpressions } from "../parse/evaluate.js";
import { parseFiddle } from "../parse/parse-fiddle.js";
import { requireGameAssetsDir } from "../test-helpers.js";
import { extractAlmanac } from "./almanac.js";

import type { LocaleCode } from "#lib/types/locale.js";
import type { ItemVariant } from "#lib/types/tracker-data.js";

describe("item variants — real assets", () => {
  it("covers every same-name set, & sources each variant’s message in every locale", () => {
    const assetsDir = requireGameAssetsDir();
    const fiddle = parseFiddle(assetsDir).data;
    evaluateExpressions(fiddle);
    const localizer = createAssetsLocalizer(assetsDir);
    vi.spyOn(console, "log").mockReturnValue(undefined);
    // Throws on any set the table doesn’t cover, or any review that no longer matches.
    const { almanac } = extractAlmanac(fiddle, localizer, undefined, ITEM_VARIANT_SETS);
    vi.restoreAllMocks();

    const variantByItem = new Map<string, ItemVariant>();
    for (const { items } of Object.values(almanac)) {
      for (const { itemIds, variant } of items) if (variant) variantByItem.set(itemIds[0], variant);
    }
    expect(new Set(variantByItem.values())).toEqual(new Set(ITEM_VARIANTS));

    const items: Record<string, { category: string; description: string }> = {};
    forEachItem(fiddle, (id, item, topCategory, subCategory) => {
      items[id] = {
        category: `items/${topCategory}/${subCategory}`,
        description: String(item.description),
      };
    });
    // Check the stored translations directly so an English fallback cannot satisfy the test.
    const variantMessages: { translations: Partial<Record<LocaleCode, string | string[]>> }[] =
      acquisitionCatalog.filter(({ references }) =>
        references.some(({ file }) => file === "src/lib/data/item-variants.ts"),
      );
    expect(variantMessages).toHaveLength(ITEM_VARIANTS.length);
    expect(new Set(variantMessages.map(({ translations }) => translations.en)).size).toBe(
      ITEM_VARIANTS.length,
    );
    for (const { translations } of variantMessages) {
      for (const locale of LOCALE_CODES) {
        expect(
          translations[locale],
          `${locale} variant label for ${String(translations.en)}`,
        ).toMatch(/\S/);
      }
    }

    const translatedLocales = LOCALE_CODES.filter((locale) => locale !== "en").toSorted();
    for (const variant of ITEM_VARIANTS) {
      const { evidence, game, machine } = ITEM_VARIANT_TERMS[variant];
      expect([...game, ...machine].toSorted(), variant).toEqual(translatedLocales);
      if (game.length === 0) continue;

      // A “from game” term needs a row with this variant whose description that locale translates.
      expect(evidence && variantByItem.get(evidence), variant).toBe(variant);
      const { category, description } = items[evidence ?? ""];
      const { fallbackLocales } = localizer.localizeField({
        category,
        classification: "localizable",
        englishValue: description,
        field: "description",
        id: evidence ?? "",
        logMissing: false,
      });
      const gameLocales: readonly LocaleCode[] = game;
      expect(
        fallbackLocales.filter((locale) => gameLocales.includes(locale)),
        variant,
      ).toEqual([]);
    }
  });
});
