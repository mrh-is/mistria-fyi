import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("verify.ts", import.meta.url));

function runVerify(args: string[], failStep = "") {
  const directory = mkdtempSync(join(tmpdir(), "mistria-verify-"));
  const log = join(directory, "calls");
  const pnpm = join(directory, "fake-pnpm.mjs");
  writeFileSync(
    pnpm,
    `import { appendFileSync } from "node:fs";
const call = process.argv.slice(2).join(" ");
appendFileSync(process.env.VERIFY_TEST_LOG, call + "|" + process.env.PLAYWRIGHT_SKIP_BUILD + "\\n");
if (call === process.env.VERIFY_TEST_FAIL_STEP) process.exitCode = 7;
`,
  );
  // Windows environment keys are case-insensitive and pnpm may export `NPM_EXECPATH`, so drop
  // every spelling before pointing the launcher at the fake.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "npm_execpath"),
  );
  try {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8",
      env: {
        ...env,
        npm_execpath: pnpm,
        PLAYWRIGHT_SKIP_BUILD: "false",
        VERIFY_TEST_FAIL_STEP: failStep,
        VERIFY_TEST_LOG: log,
      },
    });
    return {
      calls: readFileSync(log, "utf8").trim().split("\n"),
      status: result.status,
      stdout: result.stdout,
    };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

describe("verify browser build reuse", () => {
  it.each(["--browser", "--all"])("builds once before both suites with %s", (flag) => {
    const { calls, status } = runVerify([flag]);
    expect(status).toBe(0);
    expect(calls.filter((call) => call.startsWith("run build|"))).toEqual(["run build|false"]);
    expect(calls.slice(-2)).toEqual(["run test:accessibility|true", "run test:pwa|true"]);
    expect(calls.indexOf("run build|false")).toBeLessThan(
      calls.indexOf("run test:accessibility|true"),
    );
    expect(calls.includes("run test:pipeline:assets|false")).toBe(flag === "--all");
  });

  it("keeps the default matrix free of browser suites", () => {
    const { calls, status } = runVerify([]);
    expect(status).toBe(0);
    expect(
      calls.some((call) => call.includes("test:accessibility") || call.includes("test:pwa")),
    ).toBe(false);
    expect(calls.every((call) => call.endsWith("|false"))).toBe(true);
  });

  it("does not run browser suites after a failed build", () => {
    const { calls, status } = runVerify(["--browser"], "run build");
    expect(status).toBe(7);
    expect(calls.at(-1)).toBe("run build|false");
  });

  it("stops before PWA when accessibility fails", () => {
    const { calls, status } = runVerify(["--browser"], "run test:accessibility");
    expect(status).toBe(7);
    expect(calls.at(-1)).toBe("run test:accessibility|true");
  });

  it("prints the failing step's output tail & returns its exit status", () => {
    const { stdout } = runVerify([], "run check");
    expect(stdout).toContain("✗ check (exit 7)");
    expect(stdout).not.toContain("--- check:i18n ---");
  });

  it("rejects an unknown flag", () => {
    const result = spawnSync(process.execPath, [script, "--nope"], { encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Usage: pnpm run verify");
  });
});
