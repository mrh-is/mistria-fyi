import { describe, expect, it } from "vitest";

import { getName } from "$lib/data/names";
import * as m from "$lib/paraglide/messages.js";

import { load } from "./+page";

describe("almanac page load", () => {
  it("renders metadata in the layout's locale during SSR, not the base locale", async () => {
    // Vitest's server project runs without `window`, so paraglide treats this as SSR: its
    // `getLocaleForUrl` ignores the URL there and would report `en` for `/ja/almanac`.
    const result = await load({
      parent: () => Promise.resolve({ locale: "ja" as const }),
      url: new URL("https://mistria.fyi/ja/almanac"),
    } as never);

    expect(result).toMatchObject({
      metadata: {
        description: m.almanac_page_description({}, { locale: "ja" }),
        title: getName("ui", "almanac", "ja"),
      },
    });
    expect(getName("ui", "almanac", "ja")).not.toBe(getName("ui", "almanac", "en"));
  });
});
