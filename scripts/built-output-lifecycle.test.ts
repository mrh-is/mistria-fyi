import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const { scripts } = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};
// Exercise check:built’s actual runner flags, with a short deadline & a disposable test file.
const flags = scripts["check:built"].split(" ").slice(1, -1);

describe("built-output runner lifecycle", () => {
  it("runs preview-bearing test files serially to avoid shared SQLite locks", () => {
    expect(flags).toContain("--test-concurrency=1");
  });

  it("sets a finite deadline of at most two minutes", () => {
    const timeout = flags.find((flag) => flag.startsWith("--test-timeout="));
    expect(timeout).toBeDefined();
    const milliseconds = Number(timeout?.split("=")[1]);
    expect(milliseconds).toBeGreaterThan(0);
    expect(milliseconds).toBeLessThanOrEqual(120_000);
  });

  it.each([
    { hook: "before", hookTimeout: undefined },
    { hook: "after", hookTimeout: undefined },
    { hook: "before", hookTimeout: 50 },
    { hook: "after", hookTimeout: 50 },
  ])(
    "exits unsuccessfully with a stalled $hook & hook deadline $hookTimeout",
    ({ hook, hookTimeout }) => {
      const directory = mkdtempSync(join(tmpdir(), "mistria-built-lifecycle-"));
      const fixture = join(directory, "stalled.mjs");
      try {
        writeFileSync(
          fixture,
          `import { after, before, describe, test } from "node:test";
const hook = process.env.MISTRIA_LIFECYCLE_HOOK === "before" ? before : after;
const hookTimeout = process.env.MISTRIA_LIFECYCLE_TIMEOUT;
// A finite sentinel keeps a regressed runner from leaving a live worker behind.
setTimeout(() => { console.error("lifecycle sentinel expired"); process.exit(99); }, 1500);
describe("stalled hook", () => {
  hook(async () => { await new Promise(() => {}); }, hookTimeout === undefined ? {} : { timeout: Number(hookTimeout) });
  test("assertions pass", () => {});
});
`,
        );
        const result = spawnSync(
          process.execPath,
          [
            "--import",
            "tsx",
            ...flags.map((flag) =>
              flag.startsWith("--test-timeout=") ? "--test-timeout=100" : flag,
            ),
            fixture,
          ],
          {
            encoding: "utf8",
            env: {
              ...process.env,
              MISTRIA_LIFECYCLE_HOOK: hook,
              MISTRIA_LIFECYCLE_TIMEOUT:
                hookTimeout === undefined ? undefined : String(hookTimeout),
            },
            killSignal: "SIGKILL",
            timeout: 5000,
          },
        );
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stdout + result.stderr).toContain(
          `test timed out after ${String(hookTimeout ?? 100)}ms`,
        );
        expect(result.stdout + result.stderr).not.toContain("lifecycle sentinel expired");
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
  );
});
