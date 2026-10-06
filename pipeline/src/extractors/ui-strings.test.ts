import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle, stubLocalizer } from "../test-helpers.js";
import { extractUiStrings, tierKeys } from "./ui-strings.js";

import type { LocaleCode } from "#lib/types/locale.js";

const localizer = stubLocalizer((input, locale) =>
  locale === "ja" ? `JA ${input.englishValue}` : undefined,
);
const { localizeField } = localizer;

beforeEach(() => {
  localizeField.mockClear();
});

function stubLocalized(perLocale: Partial<Record<LocaleCode, string>>): void {
  localizeField.mockImplementationOnce((input) => ({
    fallbackLocales: [],
    values: {
      en: input.englishValue,
      es: input.englishValue,
      fr: input.englishValue,
      ja: input.englishValue,
      ko: input.englishValue,
      ru: input.englishValue,
      "zh-Hans": input.englishValue,
      "zh-Hant": input.englishValue,
      ...perLocale,
    },
  }));
}

describe("extractUiStrings", () => {
  it("localizes each requested misc_local key without a field segment", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const fiddle = makeFiddle({ misc_local: { crops: "Crops", tier_1: "Tier 1" } });

    const { localeNames } = extractUiStrings(fiddle, localizer, ["tier_1", "crops", "crops"]);

    expect(localeNames.en).toEqual({ crops: "Crops", tier_1: "Tier 1" });
    expect(localeNames.ja).toEqual({ crops: "JA Crops", tier_1: "JA Tier 1" });
    expect(localizeField).toHaveBeenCalledTimes(2);
    expect(localizeField).toHaveBeenCalledWith({
      category: "misc_local",
      classification: "localizable",
      englishValue: "Crops",
      id: "crops",
    });
  });

  it("stores an aliased request under its id, localized from its misc_local key", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    const fiddle = makeFiddle({
      misc_local: { fish: "Fish", fishing_and_diving: "Fishing and Diving" },
    });

    const { localeNames } = extractUiStrings(fiddle, localizer, [
      { id: "fish", miscLocalKey: "fishing_and_diving" },
    ]);

    expect(localeNames.en).toEqual({ fish: "Fishing and Diving" });
    expect(localeNames.ja).toEqual({ fish: "JA Fishing and Diving" });
    expect(localizeField).toHaveBeenCalledWith({
      category: "misc_local",
      classification: "localizable",
      englishValue: "Fishing and Diving",
      id: "fishing_and_diving",
    });
  });

  it("throws when one id is requested with two misc_local keys", () => {
    const fiddle = makeFiddle({ misc_local: { fish: "Fish", other: "Other" } });
    expect(() =>
      extractUiStrings(fiddle, localizer, ["fish", { id: "fish", miscLocalKey: "other" }]),
    ).toThrow(/conflicting misc_local keys/);
  });

  it("throws when misc_local lacks the English string", () => {
    const fiddle = makeFiddle({ misc_local: { crops: "Crops" } });
    expect(() => extractUiStrings(fiddle, localizer, ["song_crystal"])).toThrow(
      /no English string for UI key "song_crystal"/,
    );
  });

  it("collapses player-gender variants to the they form", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    stubLocalized({ es: "<he>Casado</he><she>Casada</she><they>Casade</they>" });
    const fiddle = makeFiddle({ misc_local: { married: "Married" } });

    const { localeNames } = extractUiStrings(fiddle, localizer, ["married"]);

    expect(localeNames.es.married).toBe("Casade");
    expect(localeNames.en.married).toBe("Married");
  });

  it("throws on inline markup it cannot collapse", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    stubLocalized({ fr: "Appuyez sur <input_confirm>" });
    const fiddle = makeFiddle({ misc_local: { confirm: "Confirm" } });

    expect(() => extractUiStrings(fiddle, localizer, ["confirm"])).toThrow(
      /misc_local\/confirm in fr has inline markup/,
    );
  });

  it("strips a leading article per language and re-capitalizes", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    stubLocalized({ es: "El museo", fr: "Le musée", ja: "博物館", ru: "Музей" });
    const fiddle = makeFiddle({ misc_local: { the_museum: "The Museum" } });

    const { localeNames } = extractUiStrings(fiddle, localizer, [
      { id: "museum", miscLocalKey: "the_museum", stripArticle: true },
    ]);

    expect(localeNames.en.museum).toBe("Museum");
    expect(localeNames.es.museum).toBe("Museo");
    expect(localeNames.fr.museum).toBe("Musée");
    expect(localeNames.ja.museum).toBe("博物館");
    expect(localeNames.ru.museum).toBe("Музей");
  });

  it("leaves a title alone when the language wrote it without an article", () => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
    stubLocalized({ es: "Almanaque", fr: "L'almanach" });
    const fiddle = makeFiddle({ misc_local: { the_almanac: "The Almanac" } });

    const { localeNames } = extractUiStrings(fiddle, localizer, [
      { id: "almanac", miscLocalKey: "the_almanac", stripArticle: true },
    ]);

    expect(localeNames.es.almanac).toBe("Almanaque");
    expect(localeNames.fr.almanac).toBe("Almanach");
  });

  it("names tiers one-based", () => {
    expect(tierKeys(3)).toEqual(["tier_1", "tier_2", "tier_3"]);
    expect(tierKeys(0)).toEqual([]);
  });
});
