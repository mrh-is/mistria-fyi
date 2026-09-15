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
      "pnpm run lint",
    ]);
    expect(workflow.jobs?.lint.steps?.at(-1)?.run).toBe("pnpm run lint");
    expect(workflow.jobs?.check.steps?.at(-1)?.run).toBe("pnpm run check");
    expect(workflow.jobs?.test.steps?.at(-1)?.run).toBe("pnpm run test");
    expect(workflow.jobs?.build.steps?.at(-1)?.run).toBe("pnpm run build");
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
    expect(Object.keys(workflow.jobs ?? {})).toEqual(["browser-tests", "issue-sync"]);
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

  it("caches Playwright browsers and only installs on a cache miss", () => {
    const steps = workflow.jobs?.["browser-tests"].steps ?? [];
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
  });

  it("shares one build and skips rebuilding for each Playwright suite", () => {
    const steps = workflow.jobs?.["browser-tests"].steps ?? [];
    const commands = steps.flatMap((step) => (step.run === undefined ? [] : [step.run]));
    expect(commands).toContain("pnpm run build");
    expect(commands.filter((command) => command.includes("pnpm run build"))).toHaveLength(1);

    const accessibilityStep = steps.find((step) => step.id === "accessibility-tests");
    const pwaStep = steps.find((step) => step.id === "pwa-tests");
    expect(accessibilityStep?.run).toBe("pnpm run test:accessibility");
    expect(pwaStep?.run).toBe("pnpm run test:pwa");
  });

  it("keeps pull-request tests read-only and scopes issue writes to scheduled synchronization", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.jobs?.["browser-tests"].permissions).toBeUndefined();
    expect(workflow.jobs?.["issue-sync"]?.permissions).toEqual({
      contents: "read",
      issues: "write",
    });
    expect(workflow.jobs?.["issue-sync"]?.if).toContain("github.event_name == 'schedule'");
  });

  it("publishes failure evidence for both suites before preserving the failed outcome", () => {
    const steps = workflow.jobs?.["browser-tests"].steps ?? [];
    expect(steps.find((step) => step.id === "accessibility-tests")?.["continue-on-error"]).toBe(
      true,
    );
    expect(steps.find((step) => step.id === "pwa-tests")?.["continue-on-error"]).toBe(true);
    const upload = steps.find((step) => step.uses?.startsWith("actions/upload-artifact@"));
    expect(upload?.if).toContain("failure");
    expect(upload?.with?.path).toContain(".playwright-artifacts/");
    expect(upload?.with?.path).toContain(".playwright-results/");
    expect(upload?.with?.path).toContain(".playwright-pwa-report/");
    expect(upload?.with?.path).toContain(".playwright-pwa-results/");
    expect(upload?.with?.["if-no-files-found"]).toBe("ignore");
  });
});
