import { describe, expect, it } from "vitest";

import { requireGameAssetsDir } from "../test-helpers.js";
import { assertGameLanguageMapExhaustive, readGameLanguages } from "./locale-codes.js";

describe("locale-codes — real assets", () => {
  it("maps every game language l10n.meta.toml lists", () => {
    expect(() => {
      assertGameLanguageMapExhaustive(requireGameAssetsDir());
    }).not.toThrow();
  });

  it("reads display names and ship flags", () => {
    const languages = readGameLanguages(requireGameAssetsDir());

    expect(languages.eng).toMatchObject({ displayName: "English", ship: true });
    expect(languages.jpn).toMatchObject({ displayName: "日本語", ship: false });
  });
});
