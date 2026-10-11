import { describe, expect, it } from "vitest";

import { pnpmCommand } from "#scripts/lib/pnpm-command";

describe("pnpmCommand", () => {
  it("runs a JavaScript npm_execpath with the current Node", () => {
    expect(pnpmCommand(["run", "lint"], { npm_execpath: "/pnpm/bin/pnpm.cjs" }, "win32")).toEqual({
      args: ["/pnpm/bin/pnpm.cjs", "run", "lint"],
      command: process.execPath,
      shell: false,
    });
  });

  it("spawns a native npm_execpath directly", () => {
    expect(pnpmCommand(["install"], { npm_execpath: "C:/pnpm/pnpm.exe" }, "win32")).toEqual({
      args: ["install"],
      command: "C:/pnpm/pnpm.exe",
      shell: false,
    });
  });

  it.each([
    ["win32", true],
    ["darwin", false],
  ] as const)(
    "falls back to pnpm on PATH, through a shell only on Windows (%s)",
    (platform, shell) => {
      expect(pnpmCommand(["install"], {}, platform)).toEqual({
        args: ["install"],
        command: "pnpm",
        shell,
      });
    },
  );
});
