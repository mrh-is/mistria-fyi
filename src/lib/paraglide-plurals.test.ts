import { describe, expect, it } from "vitest";

import * as m from "$lib/paraglide/messages.js";
import { locales } from "$lib/paraglide/runtime.js";

import type { Locale } from "$lib/paraglide/runtime.js";

describe("plural messages", () => {
  it("covers every plural category Intl.PluralRules reports for each locale", () => {
    for (const locale of locales) {
      const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
      for (const count of [0, 1, 2, 3, 4, 5, 11, 21, 22, 25]) {
        const category = new Intl.PluralRules(locale).select(count);
        expect(categories).toContain(category);

        const result = m.search_results_count({ count }, { locale });
        expect(result).not.toBe("search_results_count");
        expect(result).toContain(count.toString());
      }
    }
  });

  it("resolves all four Russian plural categories to distinct grammatical forms", () => {
    const locale: Locale = "ru";

    expect(m.search_results_count({ count: 1 }, { locale })).toBe("1 результат");
    expect(m.search_results_count({ count: 21 }, { locale })).toBe("21 результат");

    expect(m.search_results_count({ count: 2 }, { locale })).toBe("2 результата");
    expect(m.search_results_count({ count: 22 }, { locale })).toBe("22 результата");

    expect(m.search_results_count({ count: 5 }, { locale })).toBe("5 результатов");
    expect(m.search_results_count({ count: 11 }, { locale })).toBe("11 результатов");
    expect(m.search_results_count({ count: 0 }, { locale })).toBe("0 результатов");
  });

  it("interpolates the item name alongside the recipe-count plural", () => {
    expect(
      m.search_marked_completed_with_recipes({ count: 1, name: "Copper Sword" }, { locale: "en" }),
    ).toBe('Marked "Copper Sword" completed and unlocked 1 recipe');
    expect(
      m.search_marked_completed_with_recipes({ count: 3, name: "Copper Sword" }, { locale: "en" }),
    ).toBe('Marked "Copper Sword" completed and unlocked 3 recipes');
    expect(
      m.search_marked_completed_with_recipes({ count: 3, name: "Copper Sword" }, { locale: "ru" }),
    ).toBe("«Copper Sword» отмечено как выполненное, разблокировано 3 рецепта");
  });
});
