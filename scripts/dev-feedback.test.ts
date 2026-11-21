import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs: string[] = [];
const wrappers: ReturnType<typeof spawn>[] = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) {
    if (wrapper.exitCode === null && wrapper.signalCode === null) {
      wrapper.kill("SIGKILL");
    }
  }
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("dev:feedback signal handling", () => {
  it("removes generated vars when the wrapper receives Ctrl+C", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "feedback-dev-signal-"));
    tempDirs.push(dir);
    const varsFile = path.join(dir, ".dev.vars");
    const fixture = path.join(dir, "wrapper.mjs");
    const script = path.resolve(import.meta.dirname, "dev-feedback.ts");
    writeFileSync(
      fixture,
      `import { spawn } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { waitForFeedbackDev } from ${JSON.stringify(pathToFileURL(script).href)};
const varsFile = process.env.FEEDBACK_TEST_VARS;
if (!varsFile) throw new Error("Missing test vars-file path.");
writeFileSync(varsFile, "secret");
const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
process.exitCode = await waitForFeedbackDev(child, () => rmSync(varsFile, { force: true }));
`,
    );
    const wrapper = spawn(process.execPath, ["--import", "tsx", fixture], {
      cwd: path.resolve(import.meta.dirname, ".."),
      env: { ...process.env, FEEDBACK_TEST_VARS: varsFile },
      stdio: "ignore",
    });
    wrappers.push(wrapper);

    await vi.waitFor(() => {
      expect(existsSync(varsFile)).toBe(true);
    });
    if (wrapper.pid === undefined) {
      throw new Error("Could not start the dev:feedback signal fixture.");
    }
    process.kill(wrapper.pid, "SIGINT");
    const [code, signal] = await new Promise<[null | number, NodeJS.Signals | null]>((resolve) => {
      wrapper.once("close", (exitCode, exitSignal) => {
        resolve([exitCode, exitSignal]);
      });
    });

    expect(code).toBe(130);
    expect(signal).toBeNull();
    expect(existsSync(varsFile)).toBe(false);
  });
});
