import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Workflow {
  concurrency?: { "cancel-in-progress"?: boolean; group?: string };
  jobs?: Record<string, WorkflowJob>;
  on?: {
    pull_request?: null | { paths?: string[] };
    push?: {
      branches?: string[];
    };
    schedule?: { cron: string }[];
    workflow_dispatch?: unknown;
  };
  permissions?: Record<string, string>;
}

interface WorkflowJob {
  container?: string | { image?: string; options?: string };
  if?: string;
  needs?: string | string[];
  outputs?: Record<string, string>;
  permissions?: Record<string, string>;
  "runs-on"?: string;
  steps?: WorkflowStep[];
  strategy?: { "fail-fast"?: boolean; matrix?: Record<string, string[]> };
}

interface WorkflowStep {
  "continue-on-error"?: boolean;
  env?: Record<string, string>;
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, boolean | number | string>;
}

const pinnedAction = /^[^@]+@[a-f0-9]{40}$/;
const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as Workflow;
const jobs = workflow.jobs ?? {};
const browserJobs = ["accessibility", "pwa"] as const;
const installJobs = ["lint", "check", "test", "build", ...browserJobs, "issue-sync"] as const;

function runCommands(job: undefined | WorkflowJob): string[] {
  return job?.steps?.flatMap((step) => (step.run === undefined ? [] : [step.run])) ?? [];
}

describe("CI workflow triggers", () => {
  it("runs for pull requests, main pushes, nightly, and manual dispatch", () => {
    expect(workflow.on).toEqual({
      pull_request: null,
      push: { branches: ["main"] },
      schedule: [{ cron: "17 3 * * *" }],
      workflow_dispatch: null,
    });
    expect(workflow.on).not.toHaveProperty("pull_request_target");
  });

  it("has a cancel-in-progress concurrency group", () => {
    expect(workflow.concurrency).toEqual({
      "cancel-in-progress": true,
      group: "${{ github.workflow }}-${{ github.head_ref || github.ref }}",
    });
  });
});

describe("CI workflow jobs", () => {
  it("runs lint, check, test, and build as independent parallel jobs", () => {
    expect(Object.keys(jobs)).toEqual([
      "changes",
      "lint",
      "check",
      "test",
      "build",
      "accessibility",
      "pwa",
      "issue-sync",
      "ci-passed",
    ]);
    // Each job restores the pnpm cache and installs on its own, so a shared setup job would only
    // add a serial step to the critical path.
    for (const jobName of ["changes", "lint", "check", "test", "build"] as const) {
      expect(jobs[jobName].needs).toBeUndefined();
    }

    for (const jobName of ["check", "test", "build"] as const) {
      expect(runCommands(jobs[jobName])).not.toContain("pnpm exec svelte-kit sync");
    }

    // Lint needs its own sync step: it runs on a separate runner from `check`, which is the
    // only script that generates .svelte-kit/tsconfig.json (required by oxlint's type-aware rules).
    expect(runCommands(jobs.lint)).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm exec svelte-kit sync",
      "pnpm run lint",
    ]);
    expect(runCommands(jobs.check).slice(-2)).toEqual(["pnpm run check", "pnpm run check:i18n"]);
    expect(runCommands(jobs.test).at(-1)).toBe("pnpm run test");
    // The build job also proves the Cloudflare route table keeps static assets off Functions.
    expect(runCommands(jobs.build).slice(-2)).toEqual(["pnpm run build", "pnpm run check:routes"]);
  });

  it("restores Vitest's module cache before running the tests", () => {
    const steps = jobs.test.steps ?? [];
    const cacheIndex = steps.findIndex((step) => step.uses?.startsWith("actions/cache@"));
    const testIndex = steps.findIndex((step) => step.run === "pnpm run test");
    expect(cacheIndex).toBeGreaterThan(-1);
    expect(cacheIndex).toBeLessThan(testIndex);
    expect(steps[cacheIndex].with?.path).toBe("node_modules/.vitest-cache");
    expect(steps[cacheIndex].with?.["restore-keys"]).toBeTruthy();
  });

  it("uses pinned tooling without asset-dependent commands", () => {
    for (const job of Object.values(jobs)) {
      for (const step of job.steps?.filter((entry) => entry.uses) ?? []) {
        expect(step.uses).toMatch(pinnedAction);
      }
    }

    const allCommands = Object.values(jobs).flatMap(runCommands).join("\n");
    expect(allCommands).not.toMatch(/lint:fix|pipeline --|test:pipeline:assets/);
  });

  it("installs dependencies from a frozen lockfile on Node 24 before running anything", () => {
    for (const jobName of installJobs) {
      expect(jobs[jobName]["runs-on"]).toBe("ubuntu-latest");
      expect(runCommands(jobs[jobName])[0]).toBe("pnpm install --frozen-lockfile");
      const setup = jobs[jobName].steps?.find((step) => step.uses?.startsWith("pnpm/setup@"));
      expect(setup?.with?.runtime).toBe("node@24");
    }
  });
});

describe("CI workflow permissions", () => {
  it("keeps every job read-only except scoped PR metadata and scheduled issue writes", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(jobs.changes.permissions).toEqual({ "pull-requests": "read" });
    expect(jobs["issue-sync"].permissions).toEqual({ contents: "read", issues: "write" });
    expect(jobs["issue-sync"].if).toContain("github.event_name == 'schedule'");
    for (const [jobName, job] of Object.entries(jobs)) {
      if (jobName !== "changes" && jobName !== "issue-sync") {
        expect(job.permissions).toBeUndefined();
      }
    }
    for (const job of Object.values(jobs)) {
      for (const step of job.steps?.filter((entry) =>
        entry.uses?.startsWith("actions/checkout@"),
      ) ?? []) {
        expect(step.with?.["persist-credentials"]).toBe(false);
      }
    }
  });
});

describe("CI workflow browser suites", () => {
  it("runs the browser suites only when the change detector says they are relevant", () => {
    const filter = jobs.changes.steps?.find((step) => step.id === "filter");
    expect(jobs.changes.outputs?.browser).toBe("${{ steps.filter.outputs.browser }}");
    for (const pattern of [
      "src/*",
      "static/*",
      "tests/*",
      "playwright*.config.ts",
      "pnpm-lock.yaml",
      ".github/workflows/ci.yml",
    ]) {
      expect(filter?.run).toContain(pattern);
    }
    // Only pull requests are filtered; every other event runs the suites.
    expect(filter?.run).toMatch(/browser=true\n\s*if \[ "\$EVENT_NAME" = "pull_request" \]/);

    for (const jobName of browserJobs) {
      expect(jobs[jobName].needs).toEqual(["changes", "build"]);
      expect(jobs[jobName].if).toBe("needs.changes.outputs.browser == 'true'");
    }
  });

  it("builds once and shares the output with the browser suites", () => {
    const buildUpload = jobs.build.steps?.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    );
    expect(buildUpload?.with?.name).toBe("build-output");
    expect(buildUpload?.with?.path).toBe(".svelte-kit/output/");

    for (const jobName of browserJobs) {
      const steps = jobs[jobName].steps ?? [];
      expect(runCommands(jobs[jobName])).not.toContain("pnpm run build");
      const download = steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
      expect(download?.with?.name).toBe("build-output");
      expect(download?.with?.path).toBe(".svelte-kit/output/");
    }

    const accessibilityStep = jobs.accessibility.steps?.find(
      (step) => step.id === "accessibility-tests",
    );
    const pwaStep = jobs.pwa.steps?.find((step) => step.id === "pwa-tests");
    expect(accessibilityStep?.run).toBe("pnpm run test:accessibility --shard=${{ matrix.shard }}");
    expect(accessibilityStep?.env).toEqual({ PLAYWRIGHT_SKIP_BUILD: "true" });
    expect(pwaStep?.run).toBe("pnpm run test:pwa");
    expect(pwaStep?.env).toEqual({ PLAYWRIGHT_SKIP_BUILD: "true" });
  });

  it("runs browser suites on host runners with cached Chromium", () => {
    for (const jobName of browserJobs) {
      expect(jobs[jobName].container).toBeUndefined();
      const steps = jobs[jobName].steps ?? [];
      const cache = steps.find((step) => step.id === "playwright-cache");
      expect(cache?.uses).toMatch(/^actions\/cache@[a-f0-9]{40}$/);
      expect(cache?.with?.path).toBe("~/.cache/ms-playwright");
      expect(cache?.with?.key).toBe("playwright-${{ hashFiles('pnpm-lock.yaml') }}");
      expect(
        steps.find((step) => step.run === "pnpm exec playwright install --with-deps chromium")?.if,
      ).toBe("steps.playwright-cache.outputs.cache-hit != 'true'");
      expect(
        steps.find((step) => step.run === "pnpm exec playwright install-deps chromium")?.if,
      ).toBe("steps.playwright-cache.outputs.cache-hit == 'true'");
      expect(runCommands(jobs[jobName])).not.toContain(
        'git config --global --add safe.directory "$GITHUB_WORKSPACE"',
      );
    }
  });

  it("shards accessibility across parallel matrix jobs without sharding PWA", () => {
    const shards = jobs.accessibility.strategy?.matrix?.shard ?? [];
    expect(jobs.accessibility.strategy?.["fail-fast"]).toBe(false);
    expect(shards).toEqual(["1/4", "2/4", "3/4", "4/4"]);
    expect(jobs.pwa.strategy).toBeUndefined();
  });

  it("publishes failure evidence for both suites before preserving the failed outcome", () => {
    const accessibilitySteps = jobs.accessibility.steps ?? [];
    expect(
      accessibilitySteps.find((step) => step.id === "accessibility-tests")?.["continue-on-error"],
    ).toBe(true);
    const accessibilityUpload = accessibilitySteps.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    );
    expect(accessibilityUpload?.if).toContain("failure");
    expect(accessibilityUpload?.with?.name).toBe("accessibility-report-${{ strategy.job-index }}");
    expect(accessibilityUpload?.with?.path).toContain(".playwright-artifacts/");
    expect(accessibilityUpload?.with?.path).toContain(".playwright-results/");
    expect(accessibilityUpload?.with?.["if-no-files-found"]).toBe("ignore");
    expect(accessibilitySteps.at(-1)?.run).toBe("exit 1");

    const pwaSteps = jobs.pwa.steps ?? [];
    expect(pwaSteps.find((step) => step.id === "pwa-tests")?.["continue-on-error"]).toBe(true);
    const pwaUpload = pwaSteps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(pwaUpload?.if).toContain("failure");
    expect(pwaUpload?.with?.path).toContain(".playwright-pwa-report/");
    expect(pwaUpload?.with?.path).toContain(".playwright-pwa-results/");
    expect(pwaUpload?.with?.["if-no-files-found"]).toBe("ignore");
    expect(pwaSteps.at(-1)?.run).toBe("exit 1");
  });

  it("downloads every shard's failure reports into distinct directories for issue-sync", () => {
    expect(jobs["issue-sync"].needs).toBe("accessibility");
    const download = jobs["issue-sync"].steps?.find((step) =>
      step.uses?.startsWith("actions/download-artifact@"),
    );
    expect(download?.with?.pattern).toBe("accessibility-report-*");
    expect(download?.with?.path).toBe("playwright-shard-reports");
    expect(download?.with?.["merge-multiple"]).toBeUndefined();
  });
});

describe("CI workflow gate", () => {
  it("aggregates every merge-relevant job into one always-reported check", () => {
    expect(jobs["ci-passed"].if).toBe("always()");
    expect(jobs["ci-passed"].needs).toEqual(
      Object.keys(jobs).filter((jobName) => jobName !== "issue-sync" && jobName !== "ci-passed"),
    );
    const check = jobs["ci-passed"].steps?.at(-1);
    expect(check?.env?.RESULTS).toBe("${{ join(needs.*.result, ' ') }}");
    // Skipped browser jobs pass; failures and cancellations do not.
    expect(check?.run).toContain("success | skipped) ;;");
    expect(check?.run).toContain("*) exit 1 ;;");
  });
});
