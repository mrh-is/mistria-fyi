/* oxlint-disable no-template-curly-in-string -- these tests assert literal GitHub Actions `${{ }}` expression text */
import playwrightPackage from "@playwright/test/package.json";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { TIMING_ARTIFACT } from "../scripts/nightly-report.js";
import { STEPS } from "../scripts/verify.js";

/**
 * These tests hold what a broken workflow wouldn't otherwise reveal: a check that silently stops
 * running or stops failing, a security property, or a version that has drifted. They don't restate
 * the workflow's shape, since a wrong shape fails CI on its own and a restatement only has to be
 * edited alongside every intended change.
 */

interface Workflow {
  concurrency?: { "cancel-in-progress"?: boolean; group?: string };
  env?: Record<string, string>;
  jobs?: Record<string, WorkflowJob>;
  on?: {
    pull_request?: unknown;
    pull_request_target?: unknown;
    push?: { branches?: string[] };
    schedule?: { cron: string }[];
  };
  permissions?: Record<string, string>;
}

interface WorkflowJob {
  concurrency?: Workflow["concurrency"];
  container?: string | { image?: string; options?: string };
  env?: Record<string, string>;
  environment?: string;
  if?: string;
  needs?: string | string[];
  outputs?: Record<string, string>;
  permissions?: Record<string, string>;
  "runs-on"?: string;
  steps?: WorkflowStep[];
  strategy?: { matrix?: Record<string, string[]> };
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
const installJobs = ["lint", "check", "test", "build", ...browserJobs, "issue-sync"] as const;
// Scheduled housekeeping: it reports on the repository rather than deciding whether code can merge.
const unrequiredJobs = ["issue-sync", "nightly-report"];
const deployJob = "deploy-production";

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

/** Runs the workflow's real change detector over `files`, returning its outputs. */
function detectChanges(event: string, ...files: string[]): Record<string, string> {
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
          CHANGED_FILES: files.join("\n"),
          EVENT_NAME: event,
          GITHUB_OUTPUT: output,
          PR_NUMBER: "689",
          REPOSITORY: "owner/repo",
        },
      },
    );
    expect(result.status, result.stderr).toBe(0);
    return Object.fromEntries(
      readFileSync(output, "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const separator = line.indexOf("=");
          return [line.slice(0, separator), line.slice(separator + 1)];
        }),
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

describe("CI workflow triggers", () => {
  it("never runs pull request code with the base repository's privileges", () => {
    expect(workflow.on).not.toHaveProperty("pull_request_target");
  });

  // Losing one of these stops its checks without failing anything: the schedule runs the nightly
  // jobs, & pushes to main run the full suite & produce the nightly report's samples.
  it("runs for pull requests, main pushes, & the nightly schedule", () => {
    expect(workflow.on).toHaveProperty("pull_request");
    expect(workflow.on?.push?.branches).toContain("main");
    expect(workflow.on?.schedule).not.toHaveLength(0);
  });

  // Main pushes & the schedule both run on refs/heads/main, so sharing a group would let a merge
  // cancel the nightly jobs, or the schedule cancel a push's timing sample, with nothing going red.
  it("keeps scheduled runs & main pushes from cancelling each other", () => {
    expect(workflow.concurrency?.["cancel-in-progress"]).toBe(true);
    expect(workflow.concurrency?.group).toContain("github.event_name");
  });
});

describe("CI workflow jobs", () => {
  // Lint runs on a separate runner from `check`, which is the only script that generates
  // .svelte-kit/tsconfig.json (required by oxlint's type-aware rules).
  it("generates SvelteKit's config before linting", () => {
    const lintCommands = runCommands(jobs.lint);
    expect(lintCommands.indexOf("pnpm exec svelte-kit sync")).toBeGreaterThan(-1);
    expect(lintCommands.indexOf("pnpm exec svelte-kit sync")).toBeLessThan(
      lintCommands.findIndex((command) => command.includes("--step=lint")),
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

  it.each([
    ["pull_request", "scripts/cleanup-merged-worktrees.ts", true],
    ["pull_request", "scripts/cleanup-merged-worktrees.test.ts", false],
    ["push", "scripts/cleanup-merged-worktrees.ts", true],
    ["push", "src/app.css", false],
    ["schedule", "scripts/cleanup-merged-worktrees.ts", false],
    ["workflow_dispatch", "scripts/cleanup-merged-worktrees.ts", false],
  ] as const)("detects cleanup script changes for %s: %s", (event, file, expected) => {
    expect(detectChanges(event, file).cleanup).toBe(String(expected));
  });

  // Skipping a suite can hide a failure, so each case below proves a skip safe or runs the suite.
  it.each([
    [["relay/worker.ts"], true, false],
    [["relay/wrangler.toml"], true, false],
    [["scripts/verify.ts"], false, true],
    [["scripts/sprites/sprite-manifest.ts"], false, true],
    [["pipeline/src/main.ts"], false, true],
    [[".github/workflows/deploy.yml"], false, true],
    [[".husky/pre-commit"], false, true],
    [[".claude/settings.json"], false, true],
    [[".codex/hooks.json"], false, true],
    [["stylelint.config.js"], false, true],
    [["playwright.pwa.config.ts"], false, true],
    [["scripts/vitest-wrangler-env.ts"], true, true],
    [["scripts/vitest-relay-sequencer.ts"], true, true],
    [["src/app.css"], false, false],
    [["docs/styling.md"], false, false],
    [["tests/accessibility/home.spec.ts"], false, false],
    [["src/routes/+page.svelte", "scripts/verify.ts"], false, true],
    [["src/routes/+page.svelte", "relay/worker.ts"], true, false],
    [[], false, false],
  ] as const)(
    "selects the relay & scripts tests for a pull request changing %j",
    (files, relay, scripts) => {
      const outputs = detectChanges("pull_request", ...files);
      expect(outputs.relay).toBe(String(relay));
      expect(outputs.scripts).toBe(String(scripts));
    },
  );

  it.each([
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    ".node-version",
    "vite.config.ts",
    "tsconfig.json",
    ".github/workflows/ci.yml",
  ])("runs the relay & scripts tests when a pull request changes shared input %s", (file) => {
    expect(detectChanges("pull_request", file)).toMatchObject({ relay: "true", scripts: "true" });
  });

  it.each(["push", "schedule", "workflow_dispatch"])(
    "always runs the relay & scripts tests on %s",
    (event) => {
      expect(detectChanges(event, "src/app.css")).toMatchObject({ relay: "true", scripts: "true" });
    },
  );

  it("gives the test step every test file a pull request changes, & nothing else", () => {
    expect(
      detectChanges("pull_request", "src/a.test.ts", "src/a.ts", "scripts/b.test.ts", "c.spec.ts")
        .tests,
    ).toBe("src/a.test.ts scripts/b.test.ts");
    expect(detectChanges("pull_request", "src/a.ts").tests).toBe("");
  });

  it.each(["push", "schedule", "workflow_dispatch"])(
    "never holds %s runs to the changed-file timing limit",
    (event) => {
      expect(detectChanges(event, "src/a.test.ts").tests).toBe("");
    },
  );

  // Without this wiring the changed-file timing limit & the test exclusions would silently stop
  // applying, and nothing else would fail.
  it("passes the change detector's results to the test step", () => {
    const testStep = jobs.test.steps?.find((step) => step.run === verifyCommand("test:budgets"));
    expect(jobs.test.needs).toBe("changes");
    expect(jobs.changes.outputs?.tests).toBe("${{ steps.filter.outputs.tests }}");
    expect(testStep?.env?.VITEST_TOUCHED_TEST_FILES).toBe("${{ needs.changes.outputs.tests }}");
    expect(jobs.changes.outputs?.cleanup).toBe("${{ steps.filter.outputs.cleanup }}");
    expect(testStep?.env?.VITEST_CLEANUP_CHANGED).toBe("${{ needs.changes.outputs.cleanup }}");
    for (const gate of ["relay", "scripts"]) {
      expect(jobs.changes.outputs?.[gate]).toBe(`\${{ steps.filter.outputs.${gate} }}`);
      expect(testStep?.env?.[`VITEST_${gate.toUpperCase()}_CHANGED`]).toBe(
        `\${{ needs.changes.outputs.${gate} }}`,
      );
    }
  });

  it("lets a test failure fail the test job", () => {
    const testStep = jobs.test.steps?.find((step) => step.run === verifyCommand("test:budgets"));
    expect(testStep).toBeDefined();
    expect(testStep?.["continue-on-error"]).toBeUndefined();
  });

  // A renamed artifact would leave the nightly report with nothing to read.
  it("uploads the timing artifact under the name the nightly report downloads", () => {
    const upload = jobs.test.steps?.find((step) => step.with?.name === TIMING_ARTIFACT);
    expect(upload?.uses).toMatch(/^actions\/upload-artifact@/u);
  });

  it("bounds every job with a timeout shorter than the 6 hour default", () => {
    for (const [jobName, job] of Object.entries(jobs)) {
      expect(job["timeout-minutes"], jobName).toBeGreaterThan(0);
      expect(job["timeout-minutes"], jobName).toBeLessThanOrEqual(60);
    }
  });

  it("fails a stalled pnpm/setup quickly instead of waiting out the job timeout", () => {
    const setupJobs = Object.entries(jobs).filter(([, job]) =>
      job.steps?.some((step) => step.uses?.startsWith("pnpm/setup@")),
    );
    expect(setupJobs.map(([jobName]) => jobName)).toEqual(expect.arrayContaining([...installJobs]));
    for (const [jobName, job] of setupJobs) {
      const step = job.steps?.find((entry) => entry.uses?.startsWith("pnpm/setup@"));
      expect(step?.["timeout-minutes"], jobName).toBe(3);
      expect(step?.["timeout-minutes"], jobName).toBeLessThan(job["timeout-minutes"] ?? 0);
    }
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
  it("keeps every job read-only except its scoped PR metadata & scheduled issue writes", () => {
    const elevated: Record<string, Record<string, string>> = {
      changes: { contents: "read", "pull-requests": "read" },
      "ci-passed": { actions: "read", contents: "read" },
      "issue-sync": { contents: "read", issues: "write" },
      "nightly-report": { actions: "read", contents: "read", issues: "write" },
    };
    expect(workflow.permissions).toEqual({ contents: "read" });
    for (const [jobName, job] of Object.entries(jobs)) {
      expect(job.permissions, jobName).toEqual(elevated[jobName]);
    }
    for (const jobName of unrequiredJobs) {
      expect(jobs[jobName].if).toContain("github.event_name == 'schedule'");
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
  it.each([
    "src/routes/+page.svelte",
    "static/icon.png",
    "tests/accessibility/routes.spec.ts",
    "messages/en.json",
    "project.inlang/settings.json",
    "_headers",
    "scripts/playwright-preview.ts",
    "playwright.config.ts",
    "svelte.config.js",
    "vite.config.ts",
    "package.json",
    "pnpm-lock.yaml",
    ".node-version",
    ".github/workflows/ci.yml",
  ])("runs on a pull request that changes %s", (file) => {
    expect(detectChanges("pull_request", file).browser).toBe("true");
  });

  it.each(["docs/styling.md", "AGENTS.md", "scripts/verify.ts", "pipeline/src/main.ts"])(
    "skips a pull request that only changes %s",
    (file) => {
      expect(detectChanges("pull_request", file).browser).toBe("false");
    },
  );

  it.each(["push", "schedule", "workflow_dispatch"])("always runs for %s", (event) => {
    expect(detectChanges(event, "docs/styling.md").browser).toBe("true");
  });

  it("passes the change detector's result to the browser jobs", () => {
    expect(jobs.changes.outputs?.browser).toBe("${{ steps.filter.outputs.browser }}");
    for (const jobName of browserJobs) {
      expect(jobs[jobName].needs).toContain("changes");
      expect(jobs[jobName].if).toBe("needs.changes.outputs.browser == 'true'");
    }
  });

  // Each shard allocates across the total its own entry names & runs only its share, so a missing
  // entry would silently skip that share of the tests.
  it("runs every accessibility shard", () => {
    const shards = jobs.accessibility.strategy?.matrix?.shard ?? [];
    const total = Number(shards[0]?.split("/")[1]);
    expect(total).toBeGreaterThan(0);
    expect(shards.toSorted()).toEqual(
      Array.from({ length: total }, (_, index) => `${String(index + 1)}/${String(total)}`),
    );
  });

  it("runs browser suites in the matching pinned image without browser or apt installation", () => {
    for (const jobName of browserJobs) {
      expect(jobs[jobName].container).toEqual({
        image: `mcr.microsoft.com/playwright:v${playwrightPackage.version}-noble`,
        options: "--ipc=host",
      });
      expect(runCommands(jobs[jobName]).join("\n")).not.toMatch(
        /playwright install|install-deps|--with-deps|apt-get/,
      );
    }
  });

  // These steps continue past a failure to publish its evidence, so a job would pass without this.
  it.each([
    ["accessibility", "accessibility-tests"],
    ["pwa", "pwa-tests"],
  ])("still fails %s when its tests fail", (jobName, stepId) => {
    const steps = jobs[jobName].steps ?? [];
    expect(steps.find((step) => step.id === stepId)?.["continue-on-error"]).toBe(true);
    expect(steps.at(-1)?.if).toBe(`steps.${stepId}.outcome == 'failure'`);
    expect(steps.at(-1)?.run).toBe("exit 1");
  });
});

describe("CI workflow locale sync", () => {
  it.each([
    ["pull_request", "messages/fr.json", true],
    ["pull_request", "scripts/locale-sync-allowlist.json", true],
    ["pull_request", "scripts/check-locale-sync.ts", true],
    ["pull_request", "src/app.css", false],
    ["push", "messages/fr.json", false],
    ["schedule", "messages/fr.json", false],
    ["workflow_dispatch", "messages/fr.json", false],
  ] as const)("detects message changes for %s: %s", (event, file, expected) => {
    expect(detectChanges(event, file).messages).toBe(String(expected));
  });

  // “CI passed” accepts a skipped job, so broken wiring would turn this check off with CI green.
  it("passes the change detector's result to the locale sync job", () => {
    expect(jobs.changes.outputs?.messages).toBe("${{ steps.filter.outputs.messages }}");
    expect(jobs["locale-sync"].needs).toBe("changes");
    expect(jobs["locale-sync"].if).toBe(
      "github.event_name == 'pull_request' && needs.changes.outputs.messages == 'true'",
    );
  });
});

describe("CI workflow audit", () => {
  it.each(["pull_request", "push"])("detects dependency changes on %s", (event) => {
    for (const file of [
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".github/workflows/ci.yml",
    ]) {
      expect(detectChanges(event, file).dependencies, file).toBe("true");
    }
    expect(detectChanges(event, "src/app.css", "docs/development-workflow.md").dependencies).toBe(
      "false",
    );
    expect(detectChanges(event).dependencies).toBe("false");
  });

  it("leaves scheduled audits to the report & keeps manual audits available", () => {
    expect(detectChanges("schedule").dependencies).toBe("false");
    expect(jobs.changes.outputs?.dependencies).toBe("${{ steps.filter.outputs.dependencies }}");
    expect(jobs.audit.needs).toBe("changes");
    expect(jobs.audit.if).toBe(
      "needs.changes.outputs.dependencies == 'true' || github.event_name == 'workflow_dispatch'",
    );
  });

  it("keeps the blocking audit at moderate & never masks its failure", () => {
    const step = jobs.audit.steps?.find(
      (entry) => entry.run === "node scripts/verify.ts --step=audit",
    );
    expect(step).toBeDefined();
    expect(step?.["continue-on-error"]).toBeUndefined();
    expect(STEPS.find(({ name }) => name === "audit")?.command).toEqual({
      args: ["audit", "--audit-level=moderate"],
      kind: "pnpm",
    });
  });

  it("sets up pnpm before the install-free nightly audit", () => {
    const steps = jobs["nightly-report"].steps ?? [];
    const setup = steps.findIndex((step) => step.uses?.startsWith("pnpm/setup@"));
    expect(setup).toBeGreaterThan(-1);
    expect(steps[setup].with?.install).toBe(false);
    expect(setup).toBeLessThan(
      steps.findIndex((step) => step.run === "node scripts/nightly-report.ts"),
    );
    expect(runCommands(jobs["nightly-report"])).not.toContain("pnpm install --frozen-lockfile");
  });
});

describe("CI workflow gate", () => {
  it("keeps failure context best-effort & preserves the final result check", () => {
    const steps = jobs["ci-passed"].steps ?? [];
    const contextIndex = steps.findIndex(
      (step) => step.run === "node scripts/ci-failure-context.ts",
    );
    expect(contextIndex).toBeGreaterThan(-1);
    expect(contextIndex).toBeLessThan(steps.length - 1);
    const contextSteps = steps.slice(0, contextIndex + 1);
    expect(contextSteps.length).toBeGreaterThan(0);
    for (const step of contextSteps) {
      expect(step["continue-on-error"]).toBe(true);
      expect(step.if).toBe(
        "github.event_name == 'pull_request' && contains(needs.*.result, 'failure')",
      );
    }
    expect(steps[contextIndex].env?.GH_TOKEN).toBe("${{ github.token }}");
  });

  it("aggregates every merge-relevant job into one always-reported check", () => {
    expect(jobs["ci-passed"].if).toBe("always()");
    expect(jobs["ci-passed"].needs).toEqual(
      Object.keys(jobs).filter(
        (jobName) =>
          !unrequiredJobs.includes(jobName) && jobName !== "ci-passed" && jobName !== deployJob,
      ),
    );
    const check = jobs["ci-passed"].steps?.at(-1);
    expect(check?.if).toBeUndefined();
    expect(check?.["continue-on-error"]).toBeUndefined();
    expect(check?.env?.RESULTS).toBe("${{ join(needs.*.result, ' ') }}");
  });

  it.each([
    ["success success skipped", 0],
    ["success failure skipped", 1],
    ["success cancelled skipped", 1],
  ])("executes the actual aggregate gate for %s", (results, status) => {
    const command = jobs["ci-passed"].steps?.at(-1)?.run;
    expect(command).toBeTypeOf("string");
    if (command === undefined) throw new Error("Missing aggregate gate command");
    const result = spawnSync("bash", ["-e", "-c", command], {
      encoding: "utf8",
      env: { ...process.env, RESULTS: results },
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(status);
  });
});

describe("production deployment", () => {
  const sha = "a".repeat(40);

  function runDeploy(env: { DEPLOY_HOOK_URL: string; tip?: string }) {
    const command = jobs[deployJob].steps?.at(-1)?.run;
    if (command === undefined) throw new Error("Missing deploy command");
    const bin = mkdtempSync(join(tmpdir(), "deploy-production-"));
    try {
      const curlLog = join(bin, "curl.log");
      const ghLog = join(bin, "gh.log");
      const gh = env.tip === undefined ? "exit 1" : `echo ${env.tip}`;
      writeFileSync(join(bin, "gh"), `#!/bin/sh\necho "$@" > "${ghLog}"\n${gh}\n`, { mode: 0o755 });
      writeFileSync(join(bin, "curl"), `#!/bin/sh\necho "$@" > "${curlLog}"\n`, { mode: 0o755 });
      const result = spawnSync("bash", ["-e", "-c", command], {
        encoding: "utf8",
        env: {
          ...process.env,
          DEPLOY_HOOK_URL: env.DEPLOY_HOOK_URL,
          GITHUB_SHA: sha,
          PATH: `${bin}:${process.env.PATH}`,
          REPOSITORY: "owner/repo",
        },
      });
      return {
        looked: existsSync(ghLog) ? readFileSync(ghLog, "utf8") : undefined,
        posted: existsSync(curlLog) ? readFileSync(curlLog, "utf8") : undefined,
        status: result.status,
      };
    } finally {
      rmSync(bin, { force: true, recursive: true });
    }
  }

  // Main pushes always skip locale-sync, one of the gate's needs. Without a status function, GitHub's
  // implicit `success()` would then skip this job too, leaving the run green & production stale.
  it("deploys only after the gate passes on a main push, despite skipped gate needs", () => {
    const job = jobs[deployJob];
    expect(jobs["locale-sync"].if).toContain("github.event_name == 'pull_request'");
    expect(job.needs).toBe("ci-passed");
    expect(job.if).toBe(
      "${{ !cancelled() && github.event_name == 'push' && github.ref == 'refs/heads/main' && needs.ci-passed.result == 'success' }}",
    );
  });

  it("gives the deploy step the values its script reads", () => {
    expect(jobs[deployJob].steps).toHaveLength(1);
    expect(jobs[deployJob].steps?.[0].env).toEqual({
      DEPLOY_HOOK_URL: "${{ secrets.PRODUCTION_DEPLOY_HOOK }}",
      GH_TOKEN: "${{ github.token }}",
      REPOSITORY: "${{ github.repository }}",
    });
  });

  // The hook URL needs no other authentication, so anyone who reads it can trigger a deployment.
  it("keeps the hook secret away from every other job & from repository code", () => {
    const job = jobs[deployJob];
    expect(job.environment).toBe("production");
    expect(job.steps?.filter((step) => step.uses !== undefined)).toEqual([]);
    const holders = Object.entries(jobs)
      .filter(([, entry]) => /\bsecrets\b/.test(JSON.stringify(entry)))
      .map(([jobName]) => jobName);
    expect(holders).toEqual([deployJob]);
    const environments = Object.entries(jobs)
      .filter(([, entry]) => entry.environment !== undefined)
      .map(([jobName]) => jobName);
    expect(environments).toEqual([deployJob]);
  });

  it("posts to the hook when the passing commit is still main's tip", () => {
    const { looked, posted, status } = runDeploy({
      DEPLOY_HOOK_URL: "https://hook.test/x",
      tip: sha,
    });
    expect(status).toBe(0);
    expect(looked).toContain("repos/owner/repo/commits/main");
    expect(looked).toContain("--jq .sha");
    expect(posted).toContain("https://hook.test/x");
    expect(posted).toContain("POST");
    expect(posted).toContain("--fail");
  });

  // The hook builds main's tip, which this run hasn't verified. The newer commit's run decides.
  it("leaves the deployment to the newer run when main has moved on", () => {
    const { posted, status } = runDeploy({ DEPLOY_HOOK_URL: "https://hook.test/x", tip: "b" });
    expect(status).toBe(0);
    expect(posted).toBeUndefined();
  });

  it("fails loudly rather than skipping production when the secret is missing", () => {
    const { posted, status } = runDeploy({ DEPLOY_HOOK_URL: "", tip: sha });
    expect(status).not.toBe(0);
    expect(posted).toBeUndefined();
  });

  it("doesn't deploy when it can't confirm main's tip", () => {
    const { posted, status } = runDeploy({ DEPLOY_HOOK_URL: "https://hook.test/x" });
    expect(status).not.toBe(0);
    expect(posted).toBeUndefined();
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
