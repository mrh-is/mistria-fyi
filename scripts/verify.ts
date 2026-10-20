// Runs CI's non-browser matrix (ci.yml) locally, read-only, with live output. Stops on first
// failure. Steps: lint, check, check:i18n, knip, test, build, check:routes, check:built. It never
// modifies the tree (run `pnpm run lint:fix` yourself first).
//
// Opt-in steps CI cannot run or only runs conditionally:
//   --assets   also run test:pipeline:assets (needs the game assets; CI has none)
//   --browser  also run the Playwright suites (test:accessibility & test:pwa) against a build
//   --all      both of the above
//
// CI runs the default matrix on every pull request; run this locally only for the exceptions in
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

const USAGE = "Usage: pnpm run verify [-- --assets] [--browser] [--all]";

export interface VerifyStep {
  env?: Record<string, string>;
  name: string;
}

/** The ordered steps for the given flags, or `undefined` for an unknown flag. */
export function planSteps(args: string[]): undefined | VerifyStep[] {
  let withAssets = false;
  let withBrowser = false;
  for (const arg of args) {
    if (arg === "--assets") {
      withAssets = true;
    } else if (arg === "--browser") {
      withBrowser = true;
    } else if (arg === "--all") {
      withAssets = true;
      withBrowser = true;
    } else if (arg !== "--") {
      return undefined;
    }
  }
  const steps: VerifyStep[] = [
    "lint",
    "check",
    "check:i18n",
    "knip",
    "test",
    "build",
    "check:routes",
    "check:built",
  ].map((name) => ({ name }));
  if (withAssets) {
    steps.push({ name: "test:pipeline:assets" });
  }
  if (withBrowser) {
    // Both suites use the production build already validated above.
    const env = { PLAYWRIGHT_SKIP_BUILD: "true" };
    steps.push({ env, name: "test:accessibility" }, { env, name: "test:pwa" });
  }
  return steps;
}

/** Streams each step’s output immediately, including startup & timeout diagnostics. */
function runStep(step: VerifyStep): Promise<number> {
  const { args, command, shell } = pnpmCommand(["run", step.name]);
  const child = spawn(command, args, {
    env: { ...process.env, ...step.env },
    shell,
    stdio: "inherit",
  });
  return new Promise((resolve) => {
    child.on("error", (error) => {
      console.error(`Could not start pnpm: ${error.message}`);
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
    // oxlint-disable-next-line no-await-in-loop
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
