import { afterEach, describe, expect, it } from "vitest";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

import {
  formatSaveFileError,
  formatSaveFilesError,
  formatSaveImportWarning,
  formatTransferDecodeError,
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
    expect(formatSaveFilesError({ code: "no-save-files" })).toMatch(/^No recognized save files/);
    expect(
      formatSaveFilesError({
        code: "no-valid-files",
        problems: [{ code: "invalid-json", file: "player.json" }],
      }),
    ).toBe("None of the selected save files could be read.");
  });

  it("formats .sav sizes in binary units for the locale", () => {
    const detail = { code: "too-large", maxBytes: 8 * 1024 * 1024, sizeBytes: 9_700_000 } as const;

    expect(formatSaveFileError(detail)).toBe(
      "This save file is too large (9.3 MB). The maximum supported size is 8 MB.",
    );
    overwriteGetLocale(() => "fr");
    expect(formatSaveFileError(detail)).toMatch(/\(9,3\s?Mo\)/);
  });

  it("formats transfer decode errors", () => {
    expect(formatTransferDecodeError("corrupt")).toMatch(/damaged or incomplete/);
    expect(formatTransferDecodeError("newer-version")).toMatch(/newer version/);
    expect(formatTransferDecodeError("not-transfer-code")).toMatch(/isn’t a Mistria Field Guide/);
  });
});
