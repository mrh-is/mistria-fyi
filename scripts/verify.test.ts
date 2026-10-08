import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function runVerify(args: string[], failStep = "") {
  const directory = mkdtempSync(join(tmpdir(), "mistria-verify-"));
  const log = join(directory, "calls");
  const pnpm = join(directory, "pnpm");
  writeFileSync(
    pnpm,
    `#!/bin/bash
printf '%s|%s\\n' "$*" "$PLAYWRIGHT_SKIP_BUILD" >> "$VERIFY_TEST_LOG"
if [ "$*" = "$VERIFY_TEST_FAIL_STEP" ]; then exit 7; fi
`,
  );
  chmodSync(pnpm, 0o755);
  try {
    const result = spawnSync("bash", ["scripts/verify.sh", ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH ?? ""}`,
        PLAYWRIGHT_SKIP_BUILD: "false",
        VERIFY_TEST_FAIL_STEP: failStep,
        VERIFY_TEST_LOG: log,
      },
    });
    return { calls: readFileSync(log, "utf8").trim().split("\n"), status: result.status };
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
});
