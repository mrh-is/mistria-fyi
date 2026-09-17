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

        const showMoreResult = m.show_more_count({ count }, { locale });
        expect(showMoreResult).not.toBe("show_more_count");
        expect(showMoreResult).toContain(count.toString());

        const questRecipesResult = m.quest_marked_completed_with_recipes(
          { count, name: "Copper Sword" },
          { locale },
        );
        expect(questRecipesResult).not.toBe("quest_marked_completed_with_recipes");
        expect(questRecipesResult).toContain(count.toString());

        for (const message of [
          m.merge_label_mine_floor,
          m.merge_label_npc_levels,
          m.merge_label_renown,
          m.merge_label_skill_levels,
        ]) {
          const result = message({ count }, { locale });
          expect(result).toContain(count.toString());
        }
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

  it("resolves all four Russian plural categories for the almanac show-more count", () => {
    const locale: Locale = "ru";

    expect(m.show_more_count({ count: 1 }, { locale })).toBe("Показать ещё 1…");
    expect(m.show_more_count({ count: 3 }, { locale })).toBe("Показать ещё 3…");
    expect(m.show_more_count({ count: 5 }, { locale })).toBe("Показать ещё 5…");
    expect(m.show_more_count({ count: 11 }, { locale })).toBe("Показать ещё 11…");
  });

  it("interpolates the item name alongside the recipe-count plural", () => {
    expect(
      m.quest_marked_completed_with_recipes({ count: 1, name: "Copper Sword" }, { locale: "en" }),
    ).toBe('Marked "Copper Sword" completed and unlocked 1 recipe');
    expect(
      m.quest_marked_completed_with_recipes({ count: 3, name: "Copper Sword" }, { locale: "en" }),
    ).toBe('Marked "Copper Sword" completed and unlocked 3 recipes');
    expect(
      m.quest_marked_completed_with_recipes({ count: 3, name: "Copper Sword" }, { locale: "ru" }),
    ).toBe("«Copper Sword» отмечено как выполненное, разблокировано 3 рецепта");
  });

  it("resolves all four Russian plural categories for the mine-floor merge-count label", () => {
    const locale: Locale = "ru";

    expect(m.merge_label_mine_floor({ count: 1 }, { locale })).toBe("Шахтный этаж: +1 этаж");
    expect(m.merge_label_mine_floor({ count: 3 }, { locale })).toBe("Шахтный этаж: +3 этажа");
    expect(m.merge_label_mine_floor({ count: 5 }, { locale })).toBe("Шахтный этаж: +5 этажей");
    expect(m.merge_label_mine_floor({ count: 11 }, { locale })).toBe("Шахтный этаж: +11 этажей");
  });
});
