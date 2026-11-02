import { describe, expect, it } from "vitest";

import { defaultCommandRunner } from "./github-issue.js";

describe("command runner", () => {
  const advisoryCommand = ["-e", "process.stdout.write('advisory JSON'); process.exitCode = 1;"];

  it("rejects nonzero exits by default", async () => {
    await expect(defaultCommandRunner(process.execPath, advisoryCommand)).rejects.toThrow(
      "status 1",
    );
  });

  it("retains stdout from an explicitly accepted advisory exit", async () => {
    await expect(
      defaultCommandRunner(process.execPath, advisoryCommand, undefined, [0, 1]),
    ).resolves.toBe("advisory JSON");
    await expect(
      defaultCommandRunner(process.execPath, ["-e", "process.exitCode = 2"], undefined, [0, 1]),
    ).rejects.toThrow("status 2");
  });
});
