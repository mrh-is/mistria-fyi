import { describe, expect, it } from "vitest";

import { expectNumber, expectNumberArray, expectRecord, expectString } from "./data-shapes.js";

const context = { entityId: "copper_sword", fieldPath: "value", sourcePath: "items/weapons.toml" };

describe("parsed field guards", () => {
  it("returns valid values", () => {
    expect(expectString("", context)).toBe("");
    expect(expectNumber(0, context)).toBe(0);
    expect(expectNumberArray([0, 5], context)).toEqual([0, 5]);
    const record = { id: "axe" };
    expect(expectRecord(record, context)).toBe(record);
  });

  it.each([null, undefined, [], {}, 1])(
    "rejects non-string values with provenance: %j",
    (value) => {
      expect(() => expectString(value, context)).toThrow(
        "copper_sword.value in items/weapons.toml",
      );
    },
  );

  it.each([null, undefined, "5", Number.NaN, Infinity])("rejects invalid numbers: %j", (value) => {
    expect(() => expectNumber(value, context)).toThrow("copper_sword.value in items/weapons.toml");
  });

  it.each([null, undefined, [], "record", 1])("rejects non-record values: %j", (value) => {
    expect(() => expectRecord(value, context)).toThrow("copper_sword.value in items/weapons.toml");
  });

  it("identifies the invalid array element", () => {
    expect(() => expectNumberArray([0, "5"], context)).toThrow(
      "copper_sword.value[1] in items/weapons.toml",
    );
  });
});
