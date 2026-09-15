import { describe, expect, it } from "vitest";

import { assessAxeResults, formatAxeFailures, validateAxeExceptions } from "./axe.js";

import type { AxeResults, Result } from "axe-core";

const context = { route: "/characters", state: "initial", theme: "light" } as const;

function axeResults(violations: Result[]): AxeResults {
  return {
    inapplicable: [],
    incomplete: [],
    passes: [],
    testEngine: { name: "axe-core", version: "4.13.0" },
    testEnvironment: {
      orientationAngle: 0,
      orientationType: "landscape-primary",
      userAgent: "test",
      windowHeight: 720,
      windowWidth: 1280,
    },
    testRunner: { name: "axe" },
    timestamp: "2026-09-02T00:00:00.000Z",
    toolOptions: {},
    url: "http://localhost/characters",
    violations,
  };
}

const unnamedButton: Result = {
  description: "Ensure buttons have discernible text",
  help: "Buttons must have discernible text",
  helpUrl: "https://dequeuniversity.com/rules/axe/button-name",
  id: "button-name",
  impact: "critical",
  nodes: [
    {
      all: [],
      any: [],
      failureSummary: "Fix the button accessible name.",
      html: "<button></button>",
      impact: "critical",
      none: [],
      target: ["button:nth-child(2)"],
    },
  ],
  tags: ["wcag2a", "wcag412"],
};

describe("axe violation policy", () => {
  it("formats actionable context for serious and critical failures", () => {
    const assessment = assessAxeResults(axeResults([unnamedButton]), context, []);

    expect(assessment.failures).toHaveLength(1);
    expect(formatAxeFailures(assessment)).toContain(
      [
        "route: /characters",
        "theme: light",
        "state: initial",
        "rule: button-name (critical)",
        "target: button:nth-child(2)",
        "Fix the button accessible name.",
        "https://dequeuniversity.com/rules/axe/button-name",
      ].join("\n"),
    );
  });

  it("reports minor and moderate findings without failing the gate", () => {
    const moderate = {
      ...unnamedButton,
      id: "region",
      impact: "moderate" as const,
      nodes: unnamedButton.nodes.map((node) => ({ ...node, impact: "moderate" as const })),
    };
    const assessment = assessAxeResults(axeResults([moderate]), context, []);

    expect(assessment.failures).toEqual([]);
    expect(assessment.reported).toHaveLength(1);
  });

  it("matches only a fully scoped exception", () => {
    const exception = {
      date: "2026-09-02",
      impact: "critical" as const,
      rationale: "Temporary upstream limitation.",
      reviewer: "Michael",
      route: "/characters",
      rule: "button-name",
      state: "initial",
      target: "button:nth-child(2)",
      theme: "light" as const,
      trackingIssue: "#999",
    };

    expect(assessAxeResults(axeResults([unnamedButton]), context, [exception])).toMatchObject({
      failures: [],
      staleExceptions: [],
    });
    expect(
      assessAxeResults(axeResults([unnamedButton]), context, [
        { ...exception, target: "button:nth-child(3)" },
      ]),
    ).toMatchObject({
      failures: [expect.objectContaining({ rule: "button-name" })],
      staleExceptions: [expect.objectContaining({ target: "button:nth-child(3)" })],
    });
  });

  it("rejects broad or incomplete exceptions", () => {
    expect(() => {
      validateAxeExceptions([
        {
          date: "",
          impact: "critical",
          rationale: "",
          reviewer: "",
          route: "*",
          rule: "button-name",
          state: "*",
          target: "*",
          theme: "light",
          trackingIssue: "",
        },
      ]);
    }).toThrow("Axe exceptions must be exact and fully documented");
  });
});
