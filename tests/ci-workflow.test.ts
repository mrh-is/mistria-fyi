/* oxlint-disable no-template-curly-in-string -- these tests assert literal GitHub Actions `${{ }}` expression text */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  concurrency?: Workflow["concurrency"];
  container?: string | { image?: string; options?: string };
  if?: string;
  needs?: string | string[];
  outputs?: Record<string, string>;
  permissions?: Record<string, string>;
  "runs-on"?: string;
  steps?: WorkflowStep[];
  strategy?: { "fail-fast"?: boolean; matrix?: Record<string, string[]> };
  "timeout-minutes"?: number;
}

interface WorkflowStep {
  "continue-on-error"?: boolean;
  env?: Record<string, string>;
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  "timeout-minutes"?: number;
  uses?: string;
  with?: Record<string, boolean | number | string>;
}

const pinnedAction = /^[^@]+@[a-f0-9]{40}$/;
const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as Workflow;
const jobs = workflow.jobs ?? {};
const browserJobs = ["accessibility", "pwa"] as const;
const requiredJobs = ["changes", "lint", "check", "test", "build", "ci-passed"] as const;
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
    expect(Object.keys(jobs)).toEqual(expect.arrayContaining([...requiredJobs, ...browserJobs]));
    // Each job restores the pnpm cache and installs on its own, so a shared setup job would only
    // add a serial step to the critical path.
    for (const jobName of ["changes", "lint", "check", "build"] as const) {
      expect(jobs[jobName].needs).toBeUndefined();
    }

    expect(jobs.test.needs).toBe("changes");

    for (const jobName of ["check", "test", "build"] as const) {
      expect(runCommands(jobs[jobName])).not.toContain("pnpm exec svelte-kit sync");
    }

    // Lint needs its own sync step: it runs on a separate runner from `check`, which is the
    // only script that generates .svelte-kit/tsconfig.json (required by oxlint's type-aware rules).
    const lintCommands = runCommands(jobs.lint);
    expect(lintCommands).toContain("pnpm run lint");
    expect(lintCommands.indexOf("pnpm exec svelte-kit sync")).toBeGreaterThan(-1);
    expect(lintCommands.indexOf("pnpm exec svelte-kit sync")).toBeLessThan(
      lintCommands.indexOf("pnpm run lint"),
    );
    expect(runCommands(jobs.check)).toContain("pnpm run check");
    // One pass runs the complete suite; scheduled runs also collect coverage.
    const testCommands = runCommands(jobs.test);
    expect(testCommands).toContain("node scripts/vitest-timings.ts");
    expect(testCommands).not.toContain("pnpm run test");
    expect(testCommands.indexOf("node scripts/vitest-timings.ts")).toBeLessThan(
      testCommands.indexOf('node scripts/coverage-summary.ts >> "$GITHUB_STEP_SUMMARY"'),
    );
    // The build job also proves the Cloudflare route table keeps static assets off Functions.
    expect(runCommands(jobs.build)).toEqual(
      expect.arrayContaining(["pnpm run build", "pnpm run check:routes"]),
    );
  });

  it("runs each verification command exactly once", () => {
    const commands = Object.values(jobs).flatMap((job) => runCommands(job));
    for (const command of [
      "pnpm run lint",
      "pnpm run check",
      "pnpm run check:i18n",
      "node scripts/vitest-timings.ts",
      "pnpm run build",
      "pnpm run check:routes",
    ]) {
      expect(commands.filter((entry) => entry === command)).toHaveLength(1);
    }
  });

  it("collects coverage only nightly & publishes timing evidence after failures", () => {
    const steps = jobs.test.steps ?? [];
    const testStep = steps.find((step) => step.run === "node scripts/vitest-timings.ts");
    expect(testStep?.env?.VITEST_COVERAGE).toBe("${{ github.event_name == 'schedule' }}");
    expect(testStep?.["continue-on-error"]).toBeUndefined();
    const coverageSummary = steps.find((step) => step.name === "Summarize coverage");
    expect(coverageSummary?.if).toBe("github.event_name == 'schedule'");
    const timings = steps.find((step) => step.name === "Publish Vitest timings");
    expect(timings?.if).toBe("always()");
    expect(timings?.with?.path).toBe(".vitest-artifacts/");
    expect(timings?.with?.["if-no-files-found"]).toBe("error");
  });

  it("runs cleanup tests only when the corresponding script changes", () => {
    expect(jobs.changes.outputs?.cleanup).toBe("${{ steps.filter.outputs.cleanup }}");
    const filter = jobs.changes.steps?.find((step) => step.id === "filter")?.run ?? "";
    expect(filter).toContain("cleanup=false");
    expect(filter).toContain("scripts/cleanup-merged-worktrees.sh) cleanup=true");
    expect(filter).toContain('git diff --no-renames --name-only "$BASE_SHA" HEAD');
    const testStep = jobs.test.steps?.find((step) => step.run === "node scripts/vitest-timings.ts");
    expect(testStep?.env?.VITEST_CLEANUP_CHANGED).toBe("${{ needs.changes.outputs.cleanup }}");
  });

  it.each([
    ["pull_request", "scripts/cleanup-merged-worktrees.sh", true],
    ["pull_request", "scripts/cleanup-merged-worktrees.test.ts", false],
    ["push", "scripts/cleanup-merged-worktrees.sh", true],
    ["push", "src/app.css", false],
    ["schedule", "scripts/cleanup-merged-worktrees.sh", false],
    ["workflow_dispatch", "scripts/cleanup-merged-worktrees.sh", false],
  ] as const)("detects cleanup script changes for %s: %s", (event, files, expected) => {
    const directory = mkdtempSync(join(tmpdir(), "ci-filter-"));
    const output = join(directory, "output");
    try {
      const filter = jobs.changes.steps?.find((step) => step.id === "filter")?.run ?? "";
      const result = spawnSync(
        "bash",
        [
          "-eu",
          "-o",
          "pipefail",
          "-c",
          `
        gh() { printf '%s\\n' "$CHANGED_FILES"; }
        git() { if [[ $1 == diff ]]; then printf '%s\\n' "$CHANGED_FILES"; fi; }
        ${filter}
      `,
        ],
        {
          encoding: "utf8",
          env: {
            ...process.env,
            BASE_SHA: "base",
            CHANGED_FILES: files,
            EVENT_NAME: event,
            GITHUB_OUTPUT: output,
            PR_NUMBER: "689",
            REPOSITORY: "owner/repo",
          },
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(output, "utf8")).toContain(`cleanup=${String(expected)}`);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("bounds every job with a timeout shorter than the 6 hour default", () => {
    for (const [jobName, job] of Object.entries(jobs)) {
      expect(job["timeout-minutes"], jobName).toBeGreaterThan(0);
      expect(job["timeout-minutes"], jobName).toBeLessThanOrEqual(60);
    }
  });

  it("restores Vitest's module cache before running the tests", () => {
    const steps = jobs.test.steps ?? [];
    const cacheIndex = steps.findIndex((step) => step.uses?.startsWith("actions/cache@"));
    const testIndex = steps.findIndex((step) => step.run === "node scripts/vitest-timings.ts");
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

    const allCommands = Object.values(jobs)
      .flatMap((job) => runCommands(job))
      .join("\n");
    expect(allCommands).not.toMatch(/lint:fix|pipeline --|test:pipeline:assets/);
  });

  it("installs dependencies from a frozen lockfile before running anything", () => {
    for (const jobName of installJobs) {
      expect(jobs[jobName]["runs-on"]).toBe("ubuntu-latest");
      expect(runCommands(jobs[jobName])[0]).toBe("pnpm install --frozen-lockfile");
      const setup = jobs[jobName].steps?.find((step) => step.uses?.startsWith("pnpm/setup@"));
      expect(setup).toBeDefined();
    }
  });

  it("takes the pnpm and Node versions from the repository, not the workflow", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      packageManager?: string;
    };
    expect(packageJson.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
    expect(readFileSync(".node-version", "utf8").trim()).toMatch(/^\d+\.\d+\.\d+$/);
    for (const job of Object.values(jobs)) {
      const steps = job.steps ?? [];
      const pnpmIndex = steps.findIndex((entry) => entry.uses?.startsWith("pnpm/setup@"));
      if (pnpmIndex === -1) {
        continue;
      }
      expect(steps[pnpmIndex].with?.version).toBeUndefined();
      expect(steps[pnpmIndex].with?.runtime).toBeUndefined();
      const nodeIndex = steps.findIndex((entry) => entry.uses?.startsWith("actions/setup-node@"));
      expect(nodeIndex).toBeGreaterThan(-1);
      expect(steps[nodeIndex].with?.["node-version-file"]).toBe(".node-version");
    }
  });

  it("has Dependabot keep the pinned GitHub Actions current", () => {
    const dependabot = parse(readFileSync(".github/dependabot.yml", "utf8")) as {
      updates?: { directory?: string; "package-ecosystem"?: string }[];
    };
    expect(
      dependabot.updates?.some(
        (update) => update["package-ecosystem"] === "github-actions" && update.directory === "/",
      ),
    ).toBe(true);
  });
});

describe("CI workflow permissions", () => {
  it("keeps every job read-only except scoped PR metadata and scheduled issue writes", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(jobs.changes.permissions).toEqual({ contents: "read", "pull-requests": "read" });
    expect(jobs["issue-sync"].permissions).toEqual({ contents: "read", issues: "write" });
    expect(jobs["issue-sync"].if).toContain("github.event_name == 'schedule'");
    const unprivilegedJobs = Object.entries(jobs).filter(
      ([jobName]) => jobName !== "changes" && jobName !== "issue-sync",
    );
    for (const [, job] of unprivilegedJobs) {
      expect(job.permissions).toBeUndefined();
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
    // Every input that changes browser results: the app, its assets & headers, translations
    // (specs select by accessible name), the Playwright web server & config, and the toolchain.
    for (const pattern of [
      "src/*",
      "static/*",
      "tests/*",
      "messages/*",
      "project.inlang/*",
      "_headers",
      "scripts/playwright-*",
      "playwright*.config.ts",
      "svelte.config.*",
      "vite.config.*",
      "package.json",
      "pnpm-lock.yaml",
      ".node-version",
      ".github/workflows/ci.yml",
    ]) {
      expect(filter?.run).toContain(` ${pattern}`);
    }
    // Tailwind 4 has no config file, so a tailwind.* pattern would be dead.
    expect(filter?.run).not.toContain("tailwind.*");
    // Only pull requests are filtered; every other event runs the suites.
    expect(filter?.run).toMatch(
      /browser=true[\s\S]*if \[ "\$EVENT_NAME" = "pull_request" \]; then\n\s*browser=false/,
    );

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
    expect(accessibilityStep?.run).toContain(
      "pnpm exec tsx scripts/playwright-allocation.ts ${{ matrix.shard }}",
    );
    expect(accessibilityStep?.run).toContain(
      "pnpm run test:accessibility --test-list=.playwright-artifacts/test-list.txt",
    );
    expect(accessibilityStep?.run).not.toContain("--shard=");
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
      const install = steps.find((step) => step.env?.PLAYWRIGHT_INSTALL !== undefined);
      expect(install?.env?.PLAYWRIGHT_INSTALL).toBe(
        "${{ steps.playwright-cache.outputs.cache-hit == 'true' && 'install-deps chromium' || 'install --with-deps chromium' }}",
      );
      expect(install?.["timeout-minutes"]).toBe(12);
      expect(install?.run).toContain("for attempt in 1 2; do");
      expect(install?.run).toContain(
        "timeout --kill-after=30s 5m pnpm exec playwright $PLAYWRIGHT_INSTALL && exit 0",
      );
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

  it("retains per-test timings from successful and failed accessibility runs", () => {
    const timingUpload = jobs.accessibility.steps?.find(
      (step) => step.name === "Publish accessibility timings",
    );
    expect(timingUpload?.if).toBe("always()");
    expect(timingUpload?.with?.name).toBe("accessibility-timings-${{ strategy.job-index }}");
    expect(timingUpload?.with?.path).toContain(".playwright-artifacts/results.json");
    expect(timingUpload?.with?.path).toContain(".playwright-artifacts/allocation.json");
    expect(timingUpload?.with?.path).toContain(".playwright-artifacts/test-list.txt");
    expect(timingUpload?.with?.["include-hidden-files"]).toBe(true);
  });

  it("publishes failure and recovered-retry evidence before preserving the failed outcome", () => {
    const accessibilitySteps = jobs.accessibility.steps ?? [];
    expect(
      accessibilitySteps.find((step) => step.id === "accessibility-tests")?.["continue-on-error"],
    ).toBe(true);
    const accessibilityUpload = accessibilitySteps.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    );
    expect(accessibilityUpload?.if).toContain("steps.accessibility-tests.outcome == 'failure'");
    expect(accessibilityUpload?.if).toContain(
      "hashFiles('.playwright-results/**/trace.zip') != ''",
    );
    expect(accessibilityUpload?.with?.name).toBe("accessibility-report-${{ strategy.job-index }}");
    expect(accessibilityUpload?.with?.path).toContain(".playwright-artifacts/");
    expect(accessibilityUpload?.with?.path).toContain(".playwright-results/");
    expect(accessibilityUpload?.with?.["if-no-files-found"]).toBe("ignore");
    expect(accessibilityUpload?.with?.["include-hidden-files"]).toBe(true);
    expect(accessibilitySteps.at(-1)?.run).toBe("exit 1");

    const pwaSteps = jobs.pwa.steps ?? [];
    expect(pwaSteps.find((step) => step.id === "pwa-tests")?.["continue-on-error"]).toBe(true);
    const pwaUpload = pwaSteps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(pwaUpload?.if).toContain("steps.pwa-tests.outcome == 'failure'");
    expect(pwaUpload?.if).toContain("hashFiles('.playwright-pwa-results/**/trace.zip') != ''");
    expect(pwaUpload?.with?.path).toContain(".playwright-pwa-report/");
    expect(pwaUpload?.with?.path).toContain(".playwright-pwa-results/");
    expect(pwaUpload?.with?.["if-no-files-found"]).toBe("ignore");
    expect(pwaUpload?.with?.["include-hidden-files"]).toBe(true);
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

describe("PR metadata workflows", () => {
  const metadataWorkflows = ["attribution", "guarded-paths"] as const;

  // `opened` & multiple `labeled` events can arrive together. Even cancel-in-progress: false
  // replaces an existing pending run, leaving a cancelled required check that blocks merges.
  it.each(metadataWorkflows)("%s lets every required-check run finish independently", (name) => {
    const file = parse(readFileSync(`.github/workflows/${name}.yml`, "utf8")) as Workflow;
    expect(file.concurrency).toBeUndefined();
    for (const job of Object.values(file.jobs ?? {})) {
      expect(job.concurrency).toBeUndefined();
    }
  });

  it.each(metadataWorkflows)("%s reads labels from the live PR, not the event payload", (name) => {
    const text = readFileSync(`.github/workflows/${name}.yml`, "utf8");
    expect(text).not.toContain("github.event.pull_request.labels");
    expect(text).not.toContain("github.event.pull_request.body");
    expect(text).toContain('gh api "repos/$REPOSITORY/pulls/$PR_NUMBER"');
  });
});
