/* oxlint-disable no-template-curly-in-string -- these tests assert literal GitHub Actions `${{ }}` expression text */
import playwrightPackage from "@playwright/test/package.json";
import { execFile, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

import { TIMING_ARTIFACT } from "../scripts/nightly-report.js";
import { STEPS } from "../scripts/verify.js";

/**
 * These tests hold what a broken workflow wouldn't otherwise reveal: a check that silently stops
 * running or stops failing, or a version that has drifted. Security checks live in
 * workflow-hardening.test.ts.
 */

interface Workflow {
  concurrency?: { "cancel-in-progress"?: boolean; group?: string };
  jobs?: Record<string, WorkflowJob>;
  on?: {
    pull_request?: unknown;
    push?: { branches?: string[] };
    schedule?: { cron: string }[];
  };
}

interface WorkflowJob {
  concurrency?: Workflow["concurrency"];
  container?: string | { image?: string; options?: string };
  if?: string;
  needs?: string | string[];
  outputs?: Record<string, string>;
  steps?: WorkflowStep[];
  strategy?: { matrix?: Record<string, string[]> };
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

const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as Workflow;
const jobs = workflow.jobs ?? {};
const browserJobs = ["accessibility", "pwa"] as const;
const playwrightCli = join(import.meta.dirname, "../node_modules/@playwright/test/cli.js");
// Scheduled housekeeping: it reports on the repository rather than deciding whether code can merge.
const unrequiredJobs = ["nightly-report"];

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
      expect(accessibility.default.fullyParallel).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});

function runCommands(job: undefined | WorkflowJob): string[] {
  return job?.steps?.flatMap((step) => (step.run === undefined ? [] : [step.run])) ?? [];
}

interface PlaywrightSuite {
  specs?: { id: string; tests: { projectName: string }[] }[];
  suites?: PlaywrightSuite[];
}

function listedTestIds(suite: PlaywrightSuite): string[] {
  return [
    ...(suite.specs ?? []).flatMap(({ id, tests }) =>
      tests.map(({ projectName }) => JSON.stringify([projectName, id])),
    ),
    ...(suite.suites ?? []).flatMap((child) => listedTestIds(child)),
  ];
}

async function listAccessibilityTests(args: string[] = []): Promise<string[]> {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [playwrightCli, "test", "--list", "--reporter=json", ...args],
    { encoding: "utf8", env: { ...process.env, CI: "true" } },
  );
  return listedTestIds(JSON.parse(stdout) as PlaywrightSuite);
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

  // Skipping a suite can hide a failure, so each case below proves a skip safe or runs the suite.
  it.each([
    [["relay/worker.ts"], true, false],
    [["relay/wrangler.toml"], true, false],
    [["src/lib/sync/follow.ts"], true, false],
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
    [["scripts/vitest-client-sequencer.ts"], false, true],
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

  it("avoids commands that edit the checkout or require game assets", () => {
    const allCommands = Object.values(jobs)
      .flatMap((job) => runCommands(job))
      .join("\n");
    expect(allCommands).not.toMatch(/lint:fix|pipeline --|test:pipeline:assets/);
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
});

describe("CI workflow browser suites", () => {
  it("preserves hidden static assets in the build artifact served by browser suites", () => {
    const upload = jobs.build.steps?.find((step) => step.with?.name === "build-output");
    expect(upload?.uses).toMatch(/^actions\/upload-artifact@/u);
    expect(upload?.with?.path).toBe(".svelte-kit/output/");
    expect(upload?.with?.["include-hidden-files"]).toBe(true);
  });

  it.each([
    "src/routes/+page.svelte",
    "static/icon.png",
    "tests/accessibility/routes.spec.ts",
    "src/lib/i18n/catalogs/shared.json",
    "scripts/lib/wuchale-storage.js",
    "wuchale.config.ts",
    "_headers",
    "scripts/playwright-preview.ts",
    "scripts/playwright-preview-owner.ts",
    "scripts/playwright-satoshi.ts",
    "scripts/playwright-new-helper.ts",
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

  it.each([
    "docs/styling.md",
    "AGENTS.md",
    "scripts/verify.ts",
    "pipeline/src/main.ts",
    "scripts/playwright-preview.test.ts",
  ])("skips a pull request that only changes %s", (file) => {
    expect(detectChanges("pull_request", file).browser).toBe("false");
  });

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

  // Each shard splits across the total its own entry names & runs only its share, so a missing
  // entry would silently skip that share of the tests.
  it("runs every accessibility shard", () => {
    const shards = jobs.accessibility.strategy?.matrix?.shard ?? [];
    const total = Number(shards[0]?.split("/")[1]);
    expect(total).toBeGreaterThan(0);
    expect(shards.toSorted()).toEqual(
      Array.from({ length: total }, (_, index) => `${String(index + 1)}/${String(total)}`),
    );
  });

  it("runs every unsharded accessibility test exactly once across the CI shards", async () => {
    const step = jobs.accessibility.steps?.find(({ id }) => id === "accessibility-tests");
    expect(step?.run).toBe(
      "pnpm run verify -- --step=test:accessibility --shard=${{ matrix.shard }}",
    );
    const shards = jobs.accessibility.strategy?.matrix?.shard ?? [];
    const [unsharded, ...listed] = await Promise.all([
      listAccessibilityTests(),
      ...shards.map((shard) => listAccessibilityTests([`--shard=${shard}`])),
    ]);
    const selected = listed.flat();
    expect(unsharded.length).toBeGreaterThan(0);
    expect(selected.toSorted()).toEqual(unsharded.toSorted());
    expect(new Set(selected).size).toBe(unsharded.length);
  }, 90_000);

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

  it("never masks a blocking audit failure", () => {
    const step = jobs.audit.steps?.find(
      (entry) => entry.run === "node scripts/verify.ts --step=audit",
    );
    expect(step).toBeDefined();
    expect(step?.["continue-on-error"]).toBeUndefined();
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
    for (const jobName of unrequiredJobs) {
      expect(jobs[jobName].if).toContain("github.event_name == 'schedule'");
    }
    expect(jobs["ci-passed"].needs).toEqual(
      Object.keys(jobs).filter(
        (jobName) => !unrequiredJobs.includes(jobName) && jobName !== "ci-passed",
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

describe("Guarded paths workflow", () => {
  const source = readFileSync(".github/workflows/guarded-paths.yml", "utf8");

  // `opened` & multiple `labeled` events can arrive together. Even cancel-in-progress: false
  // replaces an existing pending run, leaving a cancelled required check that blocks merges.
  it("lets every required-check run finish independently", () => {
    const file = parse(source) as Workflow;
    expect(file.concurrency).toBeUndefined();
    for (const job of Object.values(file.jobs ?? {})) {
      expect(job.concurrency).toBeUndefined();
    }
  });
});
