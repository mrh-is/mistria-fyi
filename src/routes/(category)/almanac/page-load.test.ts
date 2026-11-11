import { describe, expect, it } from "vitest";

import { getName } from "#lib/data/names.js";

import { load } from "./+page.js";

describe("almanac page load", () => {
  it("renders metadata in the layout's locale during SSR, not the base locale", async () => {
    const result = await load({
      parent: () => Promise.resolve({ locale: "ja" as const }),
      url: new URL("https://mistria.fyi/ja/almanac"),
    } as never);

    expect(result).toMatchObject({
      metadata: {
        description:
          "Fields of Mistriaの作物、採集、釣り、昆虫、アーティファクトなどのアルマナック項目を記録します。",
        title: getName("ui", "almanac", "ja"),
      },
    });
    expect(getName("ui", "almanac", "ja")).not.toBe(getName("ui", "almanac", "en"));
  });
});
