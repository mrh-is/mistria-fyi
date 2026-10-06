import { describe, expect, it } from "vitest";

import { composeInfusion, formatNumber, formatPercent, timeRangeLabel } from "./format.js";

describe("composeInfusion", () => {
  it("puts the descriptor first with a space, in English (Adjective order)", () => {
    expect(composeInfusion("Golden Retriever", "Crown", "en")).toBe("Golden Retriever Crown");
  });

  it("puts the descriptor first with no space, in Japanese (Adjective order, no space)", () => {
    expect(composeInfusion("ゴールデンレトリバー", "クラウン", "ja")).toBe(
      "ゴールデンレトリバークラウン",
    );
  });

  it("puts the descriptor last, in Russian (Noun order)", () => {
    expect(composeInfusion("Golden Retriever", "Crown", "ru")).toBe("Crown Golden Retriever");
  });
});

describe("formatNumber", () => {
  it("groups thousands per the English locale", () => {
    expect(formatNumber(5432, "en")).toBe("5,432");
  });

  it("uses the target locale's grouping character", () => {
    expect(formatNumber(5432, "fr")).toBe("5\u202F432");
  });
});

describe("formatPercent", () => {
  it("formats a 0-100 value with the locale's percent symbol", () => {
    expect(formatPercent(42, "en")).toBe("42%");
  });

  it("adds a space before the percent symbol in French", () => {
    expect(formatPercent(42, "fr")).toBe("42\u00A0%");
  });
});

describe("timeRangeLabel", () => {
  it("uses the locale's 12-hour clock", () => {
    expect(timeRangeLabel([6, 20], "en")).toBe("6:00 AM–8:00 PM");
  });

  it("wraps game hours past midnight onto the next day's clock", () => {
    expect(timeRangeLabel([20, 26], "en")).toBe("8:00 PM–2:00 AM");
  });

  it("uses the locale's 24-hour clock", () => {
    expect(timeRangeLabel([20, 26], "ru")).toBe("20:00–2:00");
    expect(timeRangeLabel([6, 20], "ja")).toBe("6:00–20:00");
  });
});
