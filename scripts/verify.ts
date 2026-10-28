// The one executable list of verification steps (ci.yml jobs & the local matrix both read it).
//
// `pnpm run verify` runs CI's non-browser matrix locally, read-only, with live output, & stops on
// the first failure. It never modifies the tree (run `pnpm run lint:fix` yourself first).
// `pnpm run verify -- --step=<name> [script args]` runs exactly one step, which is how each CI job
// runs its steps. Add or change a step in `STEPS` below; `tests/ci-workflow.isolated.test.ts`
// checks that every step with a `job` runs in exactly that job of ci.yml.
//
// Opt-in steps CI cannot run or only runs conditionally:
//   --assets   also run test:pipeline:assets (needs the game assets; CI has none)
//   --browser  also run the Playwright suites (test:accessibility & test:pwa) against a build
//   --all      both of the above
//
// CI runs the default matrix on every pull request, plus the audit, the budgeted test run, the
// stale-translation check (pull requests that touch messages only), & the browser suites (when
// their trigger paths change). Run the matrix locally only for the exceptions in
// docs/agent-verification.md (pipeline/generated-data changes, high-risk surfaces, CI-only
// failures).
// During development, run only the specific test:
//   pnpm exec vitest run path/to/file.test.ts
//
// A Node script so Windows runs it directly: from `cmd.exe`, `bash` can resolve to the WSL
// launcher, which can outlive its child and withhold the exit status (#353).
import "#scripts/lib/require-pinned-node";

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

import { pnpmCommand } from "#scripts/lib/pnpm-command";

const USAGE =
  "Usage: pnpm run verify [-- --assets] [--browser] [--all]\n" +
  "       pnpm run verify -- --step=<name> [script args]";

/** Which local run includes a step: every run, `--assets`, `--browser`, or none (CI & `--step`). */
type Matrix = "assets" | "browser" | "default" | "none";

/** How a step runs: through pnpm (`pnpm <args>`) or as a script under the running Node. */
interface StepCommand {
  args: string[];
  kind: "node" | "pnpm";
}

export interface StepDefinition {
  command: StepCommand;
  env?: Record<string, string>;
  /** The ci.yml job that runs this step, if CI runs it. */
  job?: string;
  matrix: Matrix;
  name: string;
}

export interface VerifyStep {
  /** Arguments after `--step=<name>`, passed on to the step. */
  args?: string[];
  env?: Record<string, string>;
  name: string;
}

/** A browser suite reuses the production build already validated earlier in the matrix. */
const SKIP_BUILD = { PLAYWRIGHT_SKIP_BUILD: "true" };

const script = (name: string): StepCommand => ({ args: ["run", name], kind: "pnpm" });

/** The ordered steps. Order matters for the local matrix: later steps reuse the build. */
export const STEPS: readonly StepDefinition[] = [
  { command: script("lint"), job: "lint", matrix: "default", name: "lint" },
  {
    command: { args: ["audit", "--audit-level=moderate"], kind: "pnpm" },
    job: "audit",
    matrix: "none",
    name: "audit",
  },
  { command: script("check"), job: "check", matrix: "default", name: "check" },
  { command: script("check:i18n"), job: "check", matrix: "default", name: "check:i18n" },
  { command: script("knip"), job: "check", matrix: "default", name: "knip" },
  // Pull requests only: CI passes `--base HEAD^1`; there is no base to compare against locally.
  {
    command: script("check:locale-sync"),
    job: "locale-sync",
    matrix: "none",
    name: "check:locale-sync",
  },
  // Locally the plain suite; CI runs it as `test:budgets`, which adds per-file & wall-time budgets.
  { command: script("test"), matrix: "default", name: "test" },
  {
    command: { args: ["scripts/vitest-timings.ts"], kind: "node" },
    job: "test",
    matrix: "none",
    name: "test:budgets",
  },
  { command: script("build"), job: "build", matrix: "default", name: "build" },
  { command: script("check:routes"), job: "build", matrix: "default", name: "check:routes" },
  { command: script("check:built"), job: "build", matrix: "default", name: "check:built" },
  { command: script("test:pipeline:assets"), matrix: "assets", name: "test:pipeline:assets" },
  {
    command: script("test:accessibility"),
    env: SKIP_BUILD,
    job: "accessibility",
    matrix: "browser",
    name: "test:accessibility",
  },
  {
    command: script("test:pwa"),
    env: SKIP_BUILD,
    job: "pwa",
    matrix: "browser",
    name: "test:pwa",
  },
];

function toStep({ env, name }: StepDefinition, args?: string[]): VerifyStep {
  return { ...(args === undefined ? {} : { args }), ...(env === undefined ? {} : { env }), name };
}

/** The ordered steps for the given arguments, or `undefined` for an unknown flag or step. */
export function planSteps(args: string[]): undefined | VerifyStep[] {
  const stepFlag = args.findIndex((arg) => arg.startsWith("--step="));
  if (stepFlag !== -1) {
    const definition = STEPS.find(({ name }) => name === args[stepFlag]?.slice("--step=".length));
    // Everything else after the flag belongs to the step; matrix flags do not combine with it.
    const forwarded = args.slice(stepFlag + 1);
    const leading = args.slice(0, stepFlag).filter((arg) => arg !== "--");
    return definition === undefined || leading.length > 0
      ? undefined
      : [toStep(definition, forwarded)];
  }
  const included = new Set<Matrix>(["default"]);
  for (const arg of args) {
    if (arg === "--assets") {
      included.add("assets");
    } else if (arg === "--browser") {
      included.add("browser");
    } else if (arg === "--all") {
      included.add("assets").add("browser");
    } else if (arg !== "--") {
      return undefined;
    }
  }
  return STEPS.filter(({ matrix }) => included.has(matrix)).map((definition) => toStep(definition));
}

/**
 * The process a step starts. Forwarded arguments are refused when the launch goes through a shell
 * (Windows with no `npm_execpath`, so `cmd.exe` would reinterpret `^`, `&`, & friends in them);
 * run through `pnpm run verify`, which supplies `npm_execpath`, instead.
 */
export function stepProcess(
  definition: StepDefinition,
  forwarded: readonly string[] = [],
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): { args: string[]; command: string; shell: boolean } {
  const args = [...definition.command.args, ...forwarded];
  if (definition.command.kind === "node") {
    return { args, command: process.execPath, shell: false };
  }
  const launch = pnpmCommand(args, env, platform);
  if (launch.shell && forwarded.length > 0) {
    throw new Error(
      `Cannot pass arguments to ${definition.name} through a shell (${forwarded.join(" ")}); ` +
        "start verify with `pnpm run verify -- --step=<name> …` so pnpm launches it directly.",
    );
  }
  return launch;
}

/** Streams each step’s output immediately, including startup & timeout diagnostics. */
function runStep(step: VerifyStep): Promise<number> {
  const definition = STEPS.find(({ name }) => name === step.name);
  if (definition === undefined) return Promise.resolve(2);
  let spec: ReturnType<typeof stepProcess>;
  try {
    spec = stepProcess(definition, step.args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return Promise.resolve(2);
  }
  const { args: spawnArgs, command, shell } = spec;
  const child = spawn(command, spawnArgs, {
    env: { ...process.env, ...step.env },
    shell,
    stdio: "inherit",
  });
  return new Promise((resolve) => {
    child.on("error", (error) => {
      console.error(
        `Could not start ${definition.command.kind === "node" ? "node" : "pnpm"}: ${error.message}`,
      );
      resolve(1);
    });
    child.on("close", (code) => {
      resolve(code ?? 1);
    });
  });
}

async function main(args: string[]): Promise<number> {
  const steps = planSteps(args);
  if (!steps) {
    console.error(USAGE);
    return 2;
  }
  for (const step of steps) {
    console.log(`\n--- ${step.name} ---`);
    // Steps run in order & stop at the first failure; later steps reuse earlier output (the build).
    // oxlint-disable-next-line no-await-in-loop -- Steps share output, so they run in sequence.
    const status = await runStep(step);
    if (status !== 0) {
      console.log(`✗ ${step.name} (exit ${String(status)})`);
      return status;
    }
    console.log(`✓ ${step.name}`);
  }
  console.log("\n=== All checks passed ===");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
