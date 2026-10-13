import { describe, expect, it } from "vitest";

import { windowsProcessPaths } from "./windows-process-paths.js";

describe("Windows process paths", () => {
  it("finds option-attached paths, including quoted values with spaces", () => {
    expect(
      windowsProcessPaths(
        JSON.stringify({
          CommandLine:
            'node C:\\tools\\vite.js --config=C:\\repo\\vite.config.ts --root="C:\\My repo\\worktree"',
        }),
      ),
    ).toStrictEqual([
      String.raw`C:\tools\vite.js`,
      String.raw`C:\repo\vite.config.ts`,
      String.raw`C:\My repo\worktree`,
    ]);
  });

  it("finds quoted dev-server paths with spaces & unquoted workerd paths", () => {
    expect(
      windowsProcessPaths(
        JSON.stringify([
          {
            CommandLine: 'node "C:\\My repo\\node_modules\\vite\\bin\\vite.js" --port 5173',
            ExecutablePath: "C:\\Program Files\\nodejs\\node.exe",
          },
          { CommandLine: "C:/repo/node_modules/workerd/workerd.exe serve", ExecutablePath: null },
        ]),
      ),
    ).toStrictEqual([
      String.raw`C:\Program Files\nodejs\node.exe`,
      String.raw`C:\My repo\node_modules\vite\bin\vite.js`,
      "C:/repo/node_modules/workerd/workerd.exe",
    ]);
  });

  it("accepts a single record, inaccessible processes, & an empty inventory", () => {
    expect(windowsProcessPaths('{"ExecutablePath":null,"CommandLine":null}')).toStrictEqual([]);
    expect(windowsProcessPaths("[]")).toStrictEqual([]);
  });

  it("reports malformed output as unavailable", () => {
    expect(windowsProcessPaths("not JSON")).toBeUndefined();
    expect(windowsProcessPaths('[{"CommandLine":42}]')).toBeUndefined();
  });
});
