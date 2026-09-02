import { describe, expect, it } from "vitest";

import { findOverflow, findTargetSizeViolations } from "./geometry.js";

describe("accessibility geometry diagnostics", () => {
  it("reports elements crossing either viewport edge", () => {
    expect(
      findOverflow(
        [
          { bottom: 40, label: "Previous", left: -4, right: 40, selector: "#previous", top: 0 },
          { bottom: 40, label: "Next", left: 300, right: 328, selector: "#next", top: 0 },
          { bottom: 80, label: "Inside", left: 10, right: 310, selector: "main", top: 40 },
        ],
        320,
      ),
    ).toEqual([
      { label: "Previous", left: -4, right: 40, selector: "#previous", viewportWidth: 320 },
      { label: "Next", left: 300, right: 328, selector: "#next", viewportWidth: 320 },
    ]);
  });

  it("accepts 24-pixel targets, spaced small targets, and inline links", () => {
    expect(
      findTargetSizeViolations([
        {
          centerX: 12,
          centerY: 12,
          height: 24,
          inline: false,
          label: "Large",
          selector: "#large",
          width: 24,
        },
        {
          centerX: 60,
          centerY: 12,
          height: 16,
          inline: false,
          label: "Spaced",
          selector: "#spaced",
          width: 16,
        },
        {
          centerX: 90,
          centerY: 12,
          height: 16,
          inline: true,
          label: "Inline",
          selector: "#inline",
          width: 16,
        },
      ]),
    ).toEqual([]);
  });

  it("reports crowded undersized targets and selected 44-pixel targets", () => {
    const targets = [
      {
        centerX: 10,
        centerY: 10,
        height: 16,
        inline: false,
        label: "First",
        selector: "#first",
        width: 16,
      },
      {
        centerX: 28,
        centerY: 10,
        height: 16,
        inline: false,
        label: "Second",
        selector: "#second",
        width: 16,
      },
      {
        centerX: 80,
        centerY: 20,
        height: 40,
        inline: false,
        label: "Primary",
        selector: "#primary",
        width: 44,
      },
    ];

    expect(findTargetSizeViolations(targets, new Set(["#primary"]))).toEqual([
      expect.objectContaining({ label: "First", minimum: 24, selector: "#first" }),
      expect.objectContaining({ label: "Second", minimum: 24, selector: "#second" }),
      expect.objectContaining({ label: "Primary", minimum: 44, selector: "#primary" }),
    ]);
  });
});
