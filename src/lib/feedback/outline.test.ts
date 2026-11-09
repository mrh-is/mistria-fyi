import { describe, expect, it } from "vitest";

import { outlineLines, outlineText } from "#lib/feedback/outline.js";

describe("outlineText", () => {
  it("indents nested objects two spaces, one key per line", () => {
    expect(outlineText({ progress: { skills: { fishing: 7 } }, version: 12 })).toBe(
      ["progress:", "  skills:", "    fishing: 7", "version: 12"].join("\n"),
    );
  });

  it("joins a list of plain values on one line", () => {
    expect(outlineText({ museumWings: ["fish", "bugs"] })).toBe("museumWings: fish, bugs");
  });

  it("puts a list item's first key on its dash line", () => {
    expect(
      outlineText({
        events: [
          { at: 1, outcome: "unreadable" },
          { at: 2, outcome: "ok" },
        ],
      }),
    ).toBe(
      ["events:", "  - at: 1", "    outcome: unreadable", "  - at: 2", "    outcome: ok"].join(
        "\n",
      ),
    );
  });

  it("nests a list item whose first value is itself nested", () => {
    expect(outlineText({ list: [{ inner: { a: 1 }, next: true }] })).toBe(
      ["list:", "  - inner:", "      a: 1", "    next: true"].join("\n"),
    );
  });

  it("shows empty objects, lists, & strings as a dash, and null as itself", () => {
    expect(outlineText({ a: {}, b: [], c: "", d: null, e: [{}] })).toBe(
      ["a: —", "b: —", "c: —", "d: null", "e:", "  - —"].join("\n"),
    );
  });

  it("dashes the plain values of a mixed list", () => {
    expect(outlineText({ mixed: [1, { a: 2 }] })).toBe(["mixed:", "  - 1", "  - a: 2"].join("\n"));
  });

  it("outlines a bare value or list at the top", () => {
    expect(outlineText(7)).toBe("7");
    expect(outlineText([{ a: 1 }])).toBe("- a: 1");
  });

  it("leaves out what JSON would: undefined values, shown as null inside lists", () => {
    expect(outlineText({ gone: undefined, kept: 1, list: [undefined, 2] })).toBe(
      ["kept: 1", "list: null, 2"].join("\n"),
    );
    expect(outlineText(undefined)).toBe("—");
  });

  it("keeps a multiline string on one outline line", () => {
    expect(outlineText({ note: "one\ntwo" })).toBe("note: one ↵ two");
  });
});

describe("outlineLines", () => {
  it("hangs a wrapped value just past its key", () => {
    const [line] = outlineLines({ progress: { museumWings: ["fish", "bugs"] } }).slice(1);
    expect(line).toMatchObject({ hang: 2 + "museumWings: ".length, key: "museumWings", lead: 2 });
  });

  it("hangs a list item's first key past its dash", () => {
    const [, item] = outlineLines({ events: [{ outcome: "ok" }] });
    expect(item).toMatchObject({ dash: true, hang: 2 + "- outcome: ".length, lead: 2 });
  });

  it("marks each value's kind for quiet colors", () => {
    const kinds = outlineLines({
      a: 1,
      b: true,
      c: "[redacted]",
      d: "text",
      e: null,
      f: [],
    }).map((line) => line.value?.kind);
    expect(kinds).toEqual(["number", "boolean", "redacted", "text", "null", "empty"]);
  });
});
