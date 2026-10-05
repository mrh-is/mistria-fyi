import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { guardMessage } from "./guard-generated-paths.js";

const cwd = "/work/mistria";

function edit(file_path: string) {
  return { cwd, tool_input: { file_path } };
}

describe("guardMessage", () => {
  it("blocks vendored shadcn files, absolute or relative", () => {
    expect(
      guardMessage(edit("/work/mistria/src/lib/components/ui/button/button.svelte")),
    ).toContain("shadcn-svelte");
    expect(guardMessage(edit("src/lib/components/ui/dialog/index.ts"))).toContain("shadcn-svelte");
    expect(guardMessage(edit("src/lib/components/ui/../ui/card.svelte"))).toBeDefined();
  });

  it("blocks the generated tracker data", () => {
    expect(guardMessage(edit("src/lib/data/tracker-data.json"))).toContain("pnpm run pipeline");
    expect(guardMessage(edit("/work/.worktrees/x/src/lib/data/tracker-data.json"))).toBeDefined();
  });

  it("allows lookalikes & ordinary files", () => {
    expect(guardMessage(edit("src/lib/components/icon/ui.svelte"))).toBeUndefined();
    expect(guardMessage(edit("src/lib/components/ui-kit/a.svelte"))).toBeUndefined();
    expect(guardMessage(edit("src/lib/data/tracker-data.ts"))).toBeUndefined();
    expect(guardMessage(edit("src/lib/data/tracker-data.json.md"))).toBeUndefined();
    expect(guardMessage(edit("pipeline/src/main.ts"))).toBeUndefined();
    expect(guardMessage({ cwd, tool_input: {} })).toBeUndefined();
  });
});

function run(input: unknown) {
  return spawnSync("node", ["scripts/guard-generated-paths.ts"], {
    encoding: "utf8",
    input: JSON.stringify(input),
  });
}

describe("guard-generated-paths hook", () => {
  it("exits 2 with an explanation for a guarded Write", () => {
    const result = run({
      cwd,
      tool_input: { content: "{}", file_path: "src/lib/data/tracker-data.json" },
      tool_name: "Write",
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Blocked edit");
  });

  it("exits 0 for any other edit", () => {
    const result = run({ cwd, tool_input: { file_path: "README.md" }, tool_name: "Edit" });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});
