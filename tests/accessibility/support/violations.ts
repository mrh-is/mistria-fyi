import type { ImpactValue, Result } from "axe-core";

export type AccessibilityTheme = "dark" | "light";

export interface AxeAssessment {
  failures: AxeFinding[];
  reported: AxeFinding[];
  staleExceptions: AxeException[];
}

export interface AxeException extends AxeRunContext {
  date: string;
  impact: Exclude<ImpactValue, null>;
  rationale: string;
  reviewer: string;
  rule: string;
  target: string;
  trackingIssue: string;
}

export interface AxeFinding extends AxeRunContext {
  description: string;
  failureSummary: string;
  help: string;
  helpUrl: string;
  impact: ImpactValue;
  rule: string;
  target: string;
}

export interface AxeRunContext {
  route: string;
  state: string;
  theme: AccessibilityTheme;
}

export function flattenAxeViolations(violations: Result[], context: AxeRunContext): AxeFinding[] {
  return violations.flatMap((violation) =>
    violation.nodes.map((node) => ({
      ...context,
      description: violation.description,
      failureSummary: node.failureSummary ?? "No failure summary was provided.",
      help: violation.help,
      helpUrl: violation.helpUrl,
      impact: node.impact ?? violation.impact ?? null,
      rule: violation.id,
      target: formatTarget(node.target),
    })),
  );
}

export function formatAxeFailures(assessment: AxeAssessment): string {
  return assessment.failures
    .map((failure) =>
      [
        `route: ${failure.route}`,
        `theme: ${failure.theme}`,
        `state: ${failure.state}`,
        `rule: ${failure.rule} (${failure.impact ?? "unknown"})`,
        `target: ${failure.target}`,
        failure.failureSummary,
        failure.helpUrl,
      ].join("\n"),
    )
    .join("\n\n");
}

function formatTarget(target: Result["nodes"][number]["target"]): string {
  return target
    .map((selector) => (Array.isArray(selector) ? selector.join(" -> ") : selector))
    .join(" -> ");
}
