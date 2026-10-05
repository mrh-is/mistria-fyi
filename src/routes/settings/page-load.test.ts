import { describe, expect, it } from "vitest";

import { load } from "./+page.js";

describe("legacy settings route", () => {
  it("redirects to data management and preserves deep links", () => {
    expect(() =>
      load({ url: new URL("https://mistria-fyi.test/settings?section=transfer") }),
    ).toThrow(expect.objectContaining({ location: "/en/data?section=transfer", status: 308 }));
  });
});
