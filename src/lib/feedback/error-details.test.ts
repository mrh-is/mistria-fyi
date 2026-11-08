import { describe, expect, it } from "vitest";

import { describeErrorForReport } from "./error-details.js";

describe("describeErrorForReport", () => {
  it("keeps the error's name & message", () => {
    expect(describeErrorForReport(new RangeError("offset is out of bounds"))).toBe(
      "RangeError: offset is out of bounds",
    );
  });

  it("redacts quoted fragments that could echo the save's text", () => {
    const error = new SyntaxError(`Unexpected token 'F', "Farm Hollyhock" is not valid JSON`);
    expect(describeErrorForReport(error)).toBe(
      "SyntaxError: Unexpected token [redacted], [redacted] is not valid JSON",
    );
  });

  it("collapses whitespace & caps the length", () => {
    const details = describeErrorForReport(new Error(`a\n\n${"b".repeat(400)}`));
    expect(details).toHaveLength(300);
    expect(details).toMatch(/^Error: a b+…$/u);
  });

  it("falls back to the name when there is no message", () => {
    const error = new TypeError("placeholder");
    error.message = "";
    expect(describeErrorForReport(error)).toBe("TypeError");
  });

  it("describes nothing for a thrown non-error", () => {
    expect(describeErrorForReport("not an error")).toBeUndefined();
  });
});
