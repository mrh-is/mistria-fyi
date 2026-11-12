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
          "Fields of Mistriaの農作物、採集物、魚、昆虫、遺物など、図鑑の項目を記録します。",
        title: getName("ui", "almanac", "ja"),
      },
    });
    expect(getName("ui", "almanac", "ja")).not.toBe(getName("ui", "almanac", "en"));
  });
});
