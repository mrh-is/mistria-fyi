import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeFiddle, stubLocalizer } from "../test-helpers.js";
import { extractLocationNames } from "./locations.js";

const localizer = stubLocalizer((input, locale) =>
  locale === "fr" ? `FR ${input.englishValue}` : undefined,
);

describe("extractLocationNames", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("localizes named locations and skips unnamed ones & the default", () => {
    const fiddle = makeFiddle({
      locations: {
        beach: { name: "The Beach" },
        default: { name: "MISSING NAME" },
        farm: { outdoor: true },
      },
    });

    const names = extractLocationNames(fiddle, localizer);
    expect(names.en).toEqual({ beach: "The Beach" });
    expect(names.fr).toEqual({ beach: "FR The Beach" });
  });

  it("throws when the fiddle has no locations table", () => {
    expect(() => extractLocationNames(makeFiddle({}), localizer)).toThrow(/locations table/);
  });
});
