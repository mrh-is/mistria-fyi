import { describe, expect, it } from "vitest";

import { foldName, matchesName, matchesTerms } from "./name-match.js";

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
});

describe("matchesTerms", () => {
  const name = ["Animated Clouds Window"];

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
