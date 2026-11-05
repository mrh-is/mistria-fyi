import { describe, expect, it } from "vitest";

import { foldName, matchesName, matchesTerms, matchKey } from "./name-match.js";

describe("foldName", () => {
  it("preserves ASCII punctuation and spacing in every supported locale", () => {
    for (const locale of ["en", "es", "fr", "ja", "ko", "ru", "zh-Hans", "zh-Hant"] as const) {
      expect(foldName("  APPLE Pie (1)!  ", locale)).toBe("  apple pie (1)!  ");
    }
  });

  it("lowercases and drops diacritics", () => {
    expect(foldName("Crème Brûlée", "fr")).toBe("creme brulee");
  });

  it("collapses full-width Latin and half-width katakana", () => {
    expect(foldName("ＡＢＣ", "ja")).toBe("abc");
    expect(foldName("ｶﾞｰﾃﾞﾝ", "ja")).toBe("がーでん");
  });

  it("folds katakana to hiragana but keeps voicing marks", () => {
    expect(foldName("ガーデン", "ja")).toBe("がーでん");
    expect(foldName("ヴ", "ja")).toBe("ゔ");
    expect(foldName("ガ", "ja")).not.toBe(foldName("カ", "ja"));
  });

  it("folds Cyrillic ё to е", () => {
    expect(foldName("Ёлка", "ru")).toBe("елка");
  });

  it("leaves Hangul syllables intact", () => {
    expect(foldName("한국어", "ko")).toBe("한국어");
  });
});

describe("matchesName", () => {
  it("matches a case- and accent-insensitive substring", () => {
    expect(matchesName("Crème Brûlée", "BRULEE", "fr")).toBe(true);
    expect(matchesName("Crème Brûlée", "tart", "fr")).toBe(false);
  });

  it("matches hiragana queries against katakana names", () => {
    expect(matchesName("トマトスープ", "とまと", "ja")).toBe(true);
  });

  it("matches full-width input against ASCII names", () => {
    expect(matchesName("Apple Pie", "ＰＩＥ", "en")).toBe(true);
  });

  it("treats a blank or whitespace query as matching everything", () => {
    expect(matchesName("Apple Pie", "", "en")).toBe(true);
    expect(matchesName("Apple Pie", "  ", "en")).toBe(true);
  });

  it("ignores spaces & hyphens on both sides", () => {
    expect(matchesName("Blue Gill", "bluegill", "en")).toBe(true);
    expect(matchesName("Bluegill", "blue gill", "en")).toBe(true);
    expect(matchesName("Sea-Bass", "sea bass", "en")).toBe(true);
    expect(matchesName("Jack-o’-Lantern", "jacko", "en")).toBe(true);
  });

  it("ignores full-width spaces & Unicode dashes", () => {
    expect(matchesName("青い　魚", "青い魚", "ja")).toBe(true);
    expect(matchesName("Blue–Gill", "bluegill", "en")).toBe(true);
    expect(matchesName("Blue－Gill", "bluegill", "ja")).toBe(true);
  });

  it("keeps the katakana long-vowel mark, which is a letter", () => {
    expect(matchKey("ガーデン", "ja")).toBe("がーでん");
    expect(matchesName("ガーデン", "がでん", "ja")).toBe(false);
  });

  it("treats a query of only separators as blank", () => {
    expect(matchesName("Apple Pie", " - ", "en")).toBe(true);
  });
});

describe("matchesTerms", () => {
  const name = ["Animated Clouds Window"];

  it("matches a spaced name with a query word written as one", () => {
    expect(matchesTerms(["Blue Gill"], ["White"], "white bluegill", "en")).toBe(true);
  });

  it("splits query words on hyphens as well as spaces", () => {
    expect(matchesTerms(name, ["White"], "white-window", "en")).toBe(true);
  });

  it("matches query words split across the name & a term", () => {
    expect(matchesTerms(name, ["White"], "white window", "en")).toBe(true);
    expect(matchesTerms(name, ["White"], "WHITE", "en")).toBe(true);
  });

  it("needs every word, & at least one of them in a term", () => {
    expect(matchesTerms(name, ["White"], "white door", "en")).toBe(false);
    expect(matchesTerms(name, ["White"], "window clouds", "en")).toBe(false);
    expect(matchesTerms(name, [], "window", "en")).toBe(false);
  });

  it("folds terms like names", () => {
    expect(matchesTerms(["ドア"], ["オーク材"], "おーく", "ja")).toBe(true);
  });
});
