import { AxeBuilder } from "@axe-core/playwright";

import { waitForRendering } from "./application-state.js";
import { flattenAxeViolations, formatAxeFailures } from "./violations.js";

import type { Page, TestInfo } from "@playwright/test";
import type { AxeResults } from "axe-core";

import type { AxeAssessment, AxeException, AxeFinding, AxeRunContext } from "./violations.js";

export { formatAxeFailures } from "./violations.js";
export type { AxeAssessment, AxeException, AxeRunContext } from "./violations.js";

const failingImpacts = new Set(["critical", "serious"]);

export const axeExceptions: AxeException[] = [];

export async function analyzeAccessibility(
  page: Page,
  context: AxeRunContext,
  testInfo?: TestInfo,
): Promise<AxeAssessment> {
  await waitForRendering(page);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const assessment = assessAxeResults(results, context);

  if (testInfo) {
    await testInfo.attach(`axe-${context.theme}-${context.state}`, {
      body: Buffer.from(JSON.stringify(results, null, 2)),
      contentType: "application/json",
    });
  }

  if (assessment.staleExceptions.length > 0) {
    throw new Error(
      `Remove stale axe exceptions:\n${JSON.stringify(assessment.staleExceptions, null, 2)}`,
    );
  }
  if (assessment.failures.length > 0) {
    throw new Error(`Accessibility violations:\n\n${formatAxeFailures(assessment)}`);
  }

  return assessment;
}

export function assessAxeResults(
  results: AxeResults,
  context: AxeRunContext,
  exceptions: AxeException[] = axeExceptions,
): AxeAssessment {
  validateAxeExceptions(exceptions);
  const reported = flattenAxeViolations(results.violations, context);
  const applicableExceptions = exceptions.filter(
    (exception) =>
      exception.route === context.route &&
      exception.state === context.state &&
      exception.theme === context.theme,
  );
  const usedExceptions = new Set<AxeException>();
  const failures = reported.filter((finding) => {
    if (finding.impact === null || !failingImpacts.has(finding.impact)) return false;
    const exception = applicableExceptions.find((candidate) =>
      matchesException(finding, candidate),
    );
    if (exception) {
      usedExceptions.add(exception);
      return false;
    }
    return true;
  });

  return {
    failures,
    reported,
    staleExceptions: applicableExceptions.filter((exception) => !usedExceptions.has(exception)),
  };
}

export function validateAxeExceptions(exceptions: AxeException[]): void {
  if (!exceptions.every((exception) => isExactException(exception))) {
    throw new Error("Axe exceptions must be exact and fully documented");
  }
}

function isExactException(exception: AxeException): boolean {
  const required = [
    exception.date,
    exception.impact,
    exception.rationale,
    exception.reviewer,
    exception.route,
    exception.rule,
    exception.state,
    exception.target,
    exception.theme,
    exception.trackingIssue,
  ];

  return required.every((value) => value.trim() !== "" && !value.includes("*"));
}

function matchesException(finding: AxeFinding, exception: AxeException): boolean {
  return (
    finding.impact === exception.impact &&
    finding.route === exception.route &&
    finding.rule === exception.rule &&
    finding.state === exception.state &&
    finding.target === exception.target &&
    finding.theme === exception.theme
  );
}
