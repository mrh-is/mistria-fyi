import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface Workflow {
  concurrency?: { "cancel-in-progress"?: boolean; group?: string };
  jobs?: Record<
    string,
    {
      continueOnError?: boolean;
      id?: string;
      if?: string;
      needs?: string;
      permissions?: Record<string, string>;
      "runs-on"?: string;
      steps?: WorkflowStep[];
      strategy?: { "fail-fast"?: boolean; matrix?: Record<string, string[]> };
    }
  >;
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

interface WorkflowStep {
  "continue-on-error"?: boolean;
  id?: string;
  if?: string;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, boolean | number | string>;
}

const pinnedAction = /^[^@]+@[a-f0-9]{40}$/;

describe("CI workflow", () => {
  const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as Workflow;

  it("runs for pull requests and main pushes with a cancel-in-progress concurrency group", () => {
    expect(workflow.on).toEqual({
      pull_request: null,
      push: { branches: ["main"] },
    });
    expect(workflow.concurrency).toEqual({
      "cancel-in-progress": true,
      group: "${{ github.workflow }}-${{ github.head_ref || github.ref }}",
    });
  });

  it("parallelizes lint, check, test, and build behind a shared setup job", () => {
    expect(Object.keys(workflow.jobs ?? {})).toEqual(["setup", "lint", "check", "test", "build"]);
    expect(workflow.jobs?.lint.needs).toBe("setup");
    expect(workflow.jobs?.check.needs).toBe("setup");
    expect(workflow.jobs?.test.needs).toBe("setup");
    expect(workflow.jobs?.build.needs).toBe("setup");

    for (const jobName of ["check", "test", "build"] as const) {
      expect(
        workflow.jobs?.[jobName].steps?.filter((step) => step.run).map((step) => step.run),
      ).not.toContain("pnpm exec svelte-kit sync");
    }

    // Lint needs its own sync step: it runs on a separate runner from `check`, which is the
    // only script that generates .svelte-kit/tsconfig.json (required by eslint-plugin-perfectionist).
    expect(workflow.jobs?.lint.steps?.filter((step) => step.run).map((step) => step.run)).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm exec svelte-kit sync",
      "pnpm run check:i18n",
      "pnpm run lint",
    ]);
    expect(workflow.jobs?.lint.steps?.at(-1)?.run).toBe("pnpm run lint");
    expect(workflow.jobs?.check.steps?.slice(-2).map((step) => step.run)).toEqual([
      "pnpm run check",
      "pnpm run check:i18n",
    ]);
    expect(workflow.jobs?.test.steps?.at(-1)?.run).toBe("pnpm run test");
    // The build job also proves the Cloudflare route table keeps static assets off Functions.
    expect(workflow.jobs?.build.steps?.slice(-2).map((step) => step.run)).toEqual([
      "pnpm run build",
      "pnpm run check:routes",
    ]);
  });

  it("uses pinned tooling without credentials or asset-dependent commands", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    for (const job of Object.values(workflow.jobs ?? {})) {
      expect(job.permissions).toBeUndefined();
      for (const step of job.steps?.filter((entry) => entry.uses) ?? []) {
        expect(step.uses).toMatch(pinnedAction);
      }
    }

    const allCommands = Object.values(workflow.jobs ?? {})
      .flatMap((job) => job.steps ?? [])
      .flatMap((step) => (step.run === undefined ? [] : [step.run]))
      .join("\n");
    expect(allCommands).not.toMatch(/lint:fix|pipeline --|test:pipeline:assets/);
  });

  it("runs every job on ubuntu-latest with dependencies installed from a frozen lockfile", () => {
    for (const job of Object.values(workflow.jobs ?? {})) {
      expect(job["runs-on"]).toBe("ubuntu-latest");
      const commands = job.steps?.flatMap((step) => (step.run === undefined ? [] : [step.run]));
      expect(commands?.[0]).toBe("pnpm install --frozen-lockfile");
    }
  });
});

describe("browser tests workflow", () => {
  const workflow = parse(readFileSync(".github/workflows/browser-tests.yml", "utf8")) as Workflow;

  it("runs on path-filtered pull requests, main pushes, nightly, and manual dispatch", () => {
    expect(workflow.on?.pull_request?.paths).toEqual(
      expect.arrayContaining(["src/**", "tests/**", "playwright*.config.ts", "pnpm-lock.yaml"]),
    );
    expect(workflow.on?.push).toEqual({ branches: ["main"] });
    expect(workflow.on?.schedule).toEqual([{ cron: "17 3 * * *" }]);
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.on).not.toHaveProperty("pull_request_target");
    expect(Object.keys(workflow.jobs ?? {})).toEqual([
      "build",
      "accessibility",
      "pwa",
      "issue-sync",
    ]);
  });

  it("has a cancel-in-progress concurrency group", () => {
    expect(workflow.concurrency).toEqual({
      "cancel-in-progress": true,
      group: "${{ github.workflow }}-${{ github.head_ref || github.ref }}",
    });
  });

  it("pins actions, uses Node 26, and installs only Chromium", () => {
    const steps = Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
    for (const step of steps.filter((entry) => entry.uses)) {
      expect(step.uses).toMatch(pinnedAction);
    }
    const runCommands = steps
      .filter((step) => step.run)
      .map((step) => step.run)
      .join("\n");
    expect(runCommands).toContain("playwright install --with-deps chromium");
    expect(runCommands).toContain("playwright install-deps chromium");
    expect(runCommands).not.toMatch(/firefox|webkit/);
    expect(steps.filter((step) => step.uses?.startsWith("pnpm/setup@"))).toSatisfy(
      (setupSteps: WorkflowStep[]) => setupSteps.every((step) => step.with?.runtime === "node@26"),
    );
  });

  it("caches Playwright browsers and only installs on a cache miss in each test job", () => {
    for (const jobName of ["accessibility", "pwa"] as const) {
      const steps = workflow.jobs?.[jobName].steps ?? [];
      const cacheStep = steps.find((step) => step.uses?.startsWith("actions/cache@"));
      expect(cacheStep?.id).toBe("playwright-cache");
      expect(cacheStep?.with?.path).toBe("~/.cache/ms-playwright");

      const installStep = steps.find(
        (step) => step.run === "pnpm exec playwright install --with-deps chromium",
      );
      expect(installStep?.if).toContain("!= 'true'");
      const installDepsStep = steps.find(
        (step) => step.run === "pnpm exec playwright install-deps chromium",
      );
      expect(installDepsStep?.if).toContain("== 'true'");
    }
  });

  it("builds once and shares the output with sharded accessibility and PWA jobs", () => {
    expect(workflow.jobs?.build.steps?.map((step) => step.run).filter(Boolean)).toContain(
      "pnpm run build",
    );
    const buildUpload = workflow.jobs?.build.steps?.find((step) =>
      step.uses?.startsWith("actions/upload-artifact@"),
    );
    expect(buildUpload?.with?.name).toBe("build-output");
    expect(buildUpload?.with?.path).toBe(".svelte-kit/output/");

    expect(workflow.jobs?.accessibility.needs).toBe("build");
    expect(workflow.jobs?.pwa.needs).toBe("build");
    for (const jobName of ["accessibility", "pwa"] as const) {
      const steps = workflow.jobs?.[jobName].steps ?? [];
      expect(steps.some((step) => step.run === "pnpm run build")).toBe(false);
      const download = steps.find((step) => step.uses?.startsWith("actions/download-artifact@"));
      expect(download?.with?.name).toBe("build-output");
      expect(download?.with?.path).toBe(".svelte-kit/output/");
    }

    const accessibilityStep = workflow.jobs?.accessibility.steps?.find(
      (step) => step.id === "accessibility-tests",
    );
    const pwaStep = workflow.jobs?.pwa.steps?.find((step) => step.id === "pwa-tests");
    expect(accessibilityStep?.run).toBe(
      "pnpm run test:accessibility -- --shard=${{ matrix.shard }}",
    );
    expect(pwaStep?.run).toBe("pnpm run test:pwa");
  });

  it("shards accessibility across parallel matrix jobs without sharding PWA", () => {
    expect(workflow.jobs?.accessibility.strategy).toEqual({
      "fail-fast": false,
      matrix: { shard: ["1/3", "2/3", "3/3"] },
    });
    expect(workflow.jobs?.pwa.strategy).toBeUndefined();
  });

  it("keeps pull-request tests read-only and scopes issue writes to scheduled synchronization", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs?.accessibility.permissions).toBeUndefined();
    expect(workflow.jobs?.pwa.permissions).toBeUndefined();
    expect(workflow.jobs?.["issue-sync"]?.needs).toBe("accessibility");
    expect(workflow.jobs?.["issue-sync"]?.permissions).toEqual({
      contents: "read",
      issues: "write",
    });
    expect(workflow.jobs?.["issue-sync"]?.if).toContain("github.event_name == 'schedule'");
  });

  it("publishes failure evidence for both suites before preserving the failed outcome", () => {
    const accessibilitySteps = workflow.jobs?.accessibility.steps ?? [];
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

    const pwaSteps = workflow.jobs?.pwa.steps ?? [];
    expect(pwaSteps.find((step) => step.id === "pwa-tests")?.["continue-on-error"]).toBe(true);
    const pwaUpload = pwaSteps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(pwaUpload?.if).toContain("failure");
    expect(pwaUpload?.with?.path).toContain(".playwright-pwa-report/");
    expect(pwaUpload?.with?.path).toContain(".playwright-pwa-results/");
    expect(pwaUpload?.with?.["if-no-files-found"]).toBe("ignore");
  });

  it("downloads every shard's failure reports into distinct directories for issue-sync", () => {
    const download = workflow.jobs?.["issue-sync"].steps?.find((step) =>
      step.uses?.startsWith("actions/download-artifact@"),
    );
    expect(download?.with?.pattern).toBe("accessibility-report-*");
    expect(download?.with?.path).toBe("playwright-shard-reports");
    expect(download?.with?.["merge-multiple"]).toBeUndefined();
  });
});
