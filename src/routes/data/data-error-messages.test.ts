import { afterEach, describe, expect, it } from "vitest";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

import {
  formatExtractedSaveFilesError,
  formatSavArchiveError,
  formatSaveImportWarning,
} from "./data-error-messages.js";

const defaultGetLocale = getLocale;

afterEach(() => {
  overwriteGetLocale(defaultGetLocale);
});

describe("data error messages", () => {
  it("formats save import warnings with their save paths & IDs", () => {
    expect(
      formatSaveImportWarning({ code: "unknown-id", id: "hat", path: "player.cosmetic_unlocks" }),
    ).toBe("player.cosmetic_unlocks: unrecognized ID hat; skipped");
    expect(
      formatSaveImportWarning({
        code: "level",
        issue: "above-max",
        key: "farming_level",
        max: 1000,
        value: "9999",
      }),
    ).toBe("farming_level is 9999, above the maximum of 1,000; imported as 1,000");
  });

  it("localizes warnings, keeping save identifiers untranslated", () => {
    overwriteGetLocale(() => "fr");

    expect(formatSaveImportWarning({ code: "not-a-list", path: "player.perks" })).toBe(
      "player.perks n’est pas une liste ; ignoré",
    );
  });

  it("formats file-level errors", () => {
    expect(formatExtractedSaveFilesError({ code: "no-save-files" })).toMatch(
      /^We didn’t find a save file in there/,
    );
    expect(
      formatExtractedSaveFilesError({
        code: "no-valid-files",
        problems: [{ code: "invalid-json", file: "player.json" }],
      }),
    ).toBe("We couldn’t read any of those files. Try the newest file that ends in “autosave”.");
  });

  it("formats .sav sizes in binary units for the locale", () => {
    const detail = { code: "too-large", maxBytes: 8 * 1024 * 1024, sizeBytes: 9_700_000 } as const;

    expect(formatSavArchiveError(detail)).toBe(
      "Mamma mia, that’s a big file. This app can only read save files up to 8 MB, and that file is 9.3 MB. Maybe double-check you picked the right one?",
    );
    overwriteGetLocale(() => "fr");
    expect(formatSavArchiveError(detail)).toMatch(/fait 9,3\s?Mo\./);
  });
});
