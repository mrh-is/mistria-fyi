/* oxlint-disable no-template-curly-in-string -- these tests assert literal GitHub Actions `${{ }}` expression text */
import playwrightPackage from "@playwright/test/package.json";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { STEPS } from "../scripts/verify.js";

interface Workflow {
  concurrency?: { "cancel-in-progress"?: boolean; group?: string };
  env?: Record<string, string>;
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
  env?: Record<string, string>;
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

describe("browser selection", () => {
  it.each(["true", "false", undefined])("selects pinned Chromium when CI is %s", async (ci) => {
    vi.stubEnv("CI", ci);
    // Workers skip the preview-owner probe; loading a config must not contact a server here.
    vi.stubEnv("TEST_WORKER_INDEX", "0");
    vi.resetModules();
    try {
      const accessibility = await import("../playwright.config.js");
      const pwa = await import("../playwright.pwa.config.js");
      for (const config of [accessibility.default, pwa.default]) {
        expect(config.use).toMatchObject({ defaultBrowserType: "chromium" });
        expect(config.use).not.toHaveProperty("channel");
      }
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

function runCommands(job: undefined | WorkflowJob): string[] {
  return job?.steps?.flatMap((step) => (step.run === undefined ? [] : [step.run])) ?? [];
}

/** The `run` text of a job step that starts a verify step with no extra arguments. */
function verifyCommand(name: string): string {
  return `pnpm run verify -- --step=${name}`;
}

/** The verify step names a job runs: `pnpm run verify -- --step=<name>` or the `node` form. */
function verifySteps(job: undefined | WorkflowJob): string[] {
  return runCommands(job).flatMap((command) =>
    [...command.matchAll(/(?:pnpm run verify --|node scripts\/verify\.ts) --step=([\w:-]+)/gu)].map(
      (match) => match[1],
    ),
  );
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
    expect(lintCommands.indexOf("pnpm exec svelte-kit sync")).toBeGreaterThan(-1);
    expect(lintCommands.indexOf("pnpm exec svelte-kit sync")).toBeLessThan(
      lintCommands.findIndex((command) => command.includes("--step=lint")),
    );
    // One pass runs the complete suite with budgets, never the plain local `test` step; scheduled
    // runs also collect coverage.
    const testCommands = runCommands(jobs.test);
    expect(testCommands).not.toContain(verifyCommand("test"));
    expect(testCommands.indexOf(verifyCommand("test:budgets"))).toBeLessThan(
      testCommands.indexOf('node scripts/coverage-summary.ts >> "$GITHUB_STEP_SUMMARY"'),
    );
  });

  // scripts/verify.ts is the one list of steps: each step that names a job runs in exactly that job,
  // & every step a job runs is in the list. The commands themselves live in verify.ts.
  it("runs each verify step with a job exactly once, in that job", () => {
    const allSteps = Object.entries(jobs).flatMap(([jobName, job]) =>
      verifySteps(job).map((step) => [jobName, step] as const),
    );
    for (const step of STEPS.filter(({ job }) => job !== undefined)) {
      expect(
        allSteps.filter(([, name]) => name === step.name),
        step.name,
      ).toEqual([[step.job, step.name]]);
    }
    for (const [jobName, name] of allSteps) {
      const definition = STEPS.find((step) => step.name === name);
      expect(definition, `${jobName} runs unknown step ${name}`).toBeDefined();
      expect(definition?.job, `${name} is not meant for ${jobName}`).toBe(jobName);
    }
  });

  it("runs verification only through verify, not by calling scripts directly", () => {
    // Every line of every `run:` block, so a direct call after the first line is caught too. The
    // scripts are the ones a step runs (`pnpm run <script>` or `pnpm <script>`), plus the audit & the
    // tools a script wraps.
    const scripts = STEPS.flatMap(({ command }) =>
      command.kind === "pnpm" && command.args[0] === "run" ? [command.args[1] ?? ""] : [],
    );
    const direct = new RegExp(
      // Script names are plain words, colons, & hyphens, so they need no regex escaping.
      `^(?:pnpm (?:run )?(?:${scripts.join("|")}|audit)(?:\\s|$)${String.raw`|pnpm exec (?:vitest|playwright|svelte-check)\b`}|node scripts/vitest-timings)`,
      "u",
    );
    const offenders = Object.entries(jobs).flatMap(([jobName, job]) =>
      runCommands(job)
        .flatMap((command) => command.split("\n").map((line) => line.trim()))
        .filter((line) => direct.test(line))
        .map((line) => `${jobName}: ${line}`),
    );
    expect(offenders).toEqual([]);
    // The guard catches what it claims to: a direct call on a later line of a block.
    expect(direct.test("pnpm test")).toBe(true);
    expect(direct.test("pnpm run check:i18n")).toBe(true);
    expect(direct.test("pnpm exec vitest run")).toBe(true);
    expect(direct.test("pnpm run verify -- --step=lint")).toBe(false);
  });

  it("collects coverage only nightly & publishes timing evidence after failures", () => {
    const steps = jobs.test.steps ?? [];
    const testStep = steps.find((step) => step.run === verifyCommand("test:budgets"));
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
    expect(filter).toContain("scripts/cleanup-merged-worktrees.ts) cleanup=true");
    expect(filter).toContain('git diff --no-renames --name-only "$BASE_SHA" HEAD');
    const testStep = jobs.test.steps?.find((step) => step.run === verifyCommand("test:budgets"));
    expect(testStep?.env?.VITEST_CLEANUP_CHANGED).toBe("${{ needs.changes.outputs.cleanup }}");
  });

  it.each([
    ["pull_request", "scripts/cleanup-merged-worktrees.ts", true],
    ["pull_request", "scripts/cleanup-merged-worktrees.test.ts", false],
    ["push", "scripts/cleanup-merged-worktrees.ts", true],
    ["push", "src/app.css", false],
    ["schedule", "scripts/cleanup-merged-worktrees.ts", false],
    ["workflow_dispatch", "scripts/cleanup-merged-worktrees.ts", false],
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

  it("fails a stalled pnpm/setup quickly instead of waiting out the job timeout", () => {
    const setupJobs: string[] = [];
    for (const [jobName, job] of Object.entries(jobs)) {
      for (const step of job.steps?.filter((entry) => entry.uses?.startsWith("pnpm/setup@")) ??
        []) {
        setupJobs.push(jobName);
        expect(step["timeout-minutes"], jobName).toBe(3);
        expect(step["timeout-minutes"], jobName).toBeLessThan(job["timeout-minutes"] ?? 0);
      }
    }
    // Pinning the jobs keeps a renamed or relocated action from passing vacuously.
    expect(setupJobs.toSorted()).toEqual([...installJobs, "audit", "locale-sync"].toSorted());
  });

  it("restores Vitest's module cache before running the tests", () => {
    const steps = jobs.test.steps ?? [];
    const cacheIndex = steps.findIndex((step) => step.uses?.startsWith("actions/cache@"));
    const testIndex = steps.findIndex((step) => step.run === verifyCommand("test:budgets"));
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

  it("installs dependencies from a frozen lockfile before running package commands", () => {
    for (const jobName of installJobs) {
      expect(jobs[jobName]["runs-on"]).toBe("ubuntu-latest");
      const firstCommand = runCommands(jobs[jobName]).find(
        (command) => command !== 'git config --global --add safe.directory "$GITHUB_WORKSPACE"',
      );
      expect(firstCommand).toBe("pnpm install --frozen-lockfile");
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

  it("restores the store that holds the pnpm-managed Node in every pnpm/setup job", () => {
    // The cache archive's paths are relative to the workspace, which the container mounts
    // elsewhere, so container jobs keep a store of their own that one of them saves.
    const savers: Record<string, string> = { build: "host", pwa: "container" };
    const mainPush = "${{ github.event_name == 'push' && github.ref == 'refs/heads/main' }}";
    const setupJobs = Object.entries(jobs).filter(([, job]) =>
      job.steps?.some((step) => step.uses?.startsWith("pnpm/setup@")),
    );
    expect(setupJobs.map(([name]) => name)).toEqual(
      expect.arrayContaining(["audit", ...installJobs]),
    );
    expect(workflow.env?.pnpm_config_store_dir).toBeUndefined();
    for (const [name, job] of setupJobs) {
      const inContainer = job.container !== undefined;
      expect(job.env?.pnpm_config_store_dir).toBe(inContainer ? "/__w/.pnpm-store" : undefined);
      const setup = job.steps?.find((step) => step.uses?.startsWith("pnpm/setup@"));
      expect(setup?.with?.cache).toBe(true);
      expect(setup?.with?.["save-cache"]).toBe(name in savers ? mainPush : false);
    }
    for (const [name, kind] of Object.entries(savers)) {
      expect(jobs[name].container !== undefined).toBe(kind === "container");
    }
  });

  it("has pnpm download and run the .node-version release for every script", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      devEngines?: { runtime?: { name?: string; onFail?: string; version?: string } };
    };
    expect(packageJson.devEngines?.runtime).toEqual({
      name: "node",
      onFail: "download",
      version: readFileSync(".node-version", "utf8").trim(),
    });
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
      expect(verifySteps(jobs[jobName])).not.toContain("build");
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
      "pnpm run verify -- --step=test:accessibility --test-list=.playwright-artifacts/test-list.txt",
    );
    expect(accessibilityStep?.run).not.toContain("--shard=");
    expect(accessibilityStep?.env).toEqual({ PLAYWRIGHT_SKIP_BUILD: "true" });
    expect(pwaStep?.run).toBe(verifyCommand("test:pwa"));
    expect(pwaStep?.env).toEqual({ PLAYWRIGHT_SKIP_BUILD: "true" });
  });

  it("runs browser suites in the matching pinned image without browser or apt installation", () => {
    for (const jobName of browserJobs) {
      expect(jobs[jobName].container).toEqual({
        image: `mcr.microsoft.com/playwright:v${playwrightPackage.version}-noble`,
        options: "--ipc=host",
      });
      const steps = jobs[jobName].steps ?? [];
      expect(steps.find((step) => step.id === "playwright-cache")).toBeUndefined();
      expect(steps.find((step) => step.env?.PLAYWRIGHT_INSTALL !== undefined)).toBeUndefined();
      expect(runCommands(jobs[jobName]).join("\n")).not.toMatch(
        /playwright install|install-deps|--with-deps|apt-get/,
      );
      const commands = runCommands(jobs[jobName]);
      expect(commands).toContain('git config --global --add safe.directory "$GITHUB_WORKSPACE"');
      expect(commands.indexOf('git config --global --add safe.directory "$GITHUB_WORKSPACE"')).toBe(
        0,
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
    expect(pwaUpload?.with?.path).toContain(".playwright-artifacts/preview-*.log");
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

describe("CI workflow locale sync", () => {
  it("exposes the change detector's messages output", () => {
    expect(jobs.changes.outputs?.messages).toBe("${{ steps.filter.outputs.messages }}");
  });

  it.each([
    ["pull_request", "messages/fr.json", true],
    ["pull_request", "scripts/locale-sync-allowlist.json", true],
    ["pull_request", "scripts/check-locale-sync.ts", true],
    ["pull_request", "src/app.css", false],
    ["push", "messages/fr.json", false],
    ["schedule", "messages/fr.json", false],
    ["workflow_dispatch", "messages/fr.json", false],
  ] as const)("detects message changes for %s: %s", (event, files, expected) => {
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
      expect(readFileSync(output, "utf8")).toContain(`messages=${String(expected)}`);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("runs the check on pull requests that change messages, against the merge checkout's base", () => {
    const job = jobs["locale-sync"];
    expect(job.needs).toBe("changes");
    expect(job.if).toBe(
      "github.event_name == 'pull_request' && needs.changes.outputs.messages == 'true'",
    );
    const checkout = job.steps?.find((step) => step.uses?.startsWith("actions/checkout@"));
    // HEAD^1 of the PR's merge commit is the base branch tip, so two commits of history suffice.
    expect(checkout?.with?.["fetch-depth"]).toBe(2);
    expect(runCommands(job)).toContain("pnpm run verify -- --step=check:locale-sync --base HEAD^1");
    expect(jobs["ci-passed"].needs).toContain("locale-sync");
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
