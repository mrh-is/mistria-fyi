import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("loads the worktree tsconfig when an ancestor checkout has not run SvelteKit sync", () => {
  const checkout = mkdtempSync(join(tmpdir(), "mistria-knip-"));
  try {
    const worktree = join(checkout, "worktree");
    const generated = join(worktree, "node_modules", "$app");
    const tsconfig = JSON.stringify({ extends: "$app/tsconfig" });
    mkdirSync(join(generated, "tsconfig"), { recursive: true });
    writeFileSync(join(checkout, "tsconfig.json"), tsconfig);
    writeFileSync(join(worktree, "tsconfig.json"), tsconfig);
    writeFileSync(join(generated, "tsconfig.json"), "{}");
    writeFileSync(join(worktree, "package.json"), "{}");
    writeFileSync(join(worktree, "index.js"), "");

    const cli = fileURLToPath(new URL("../bin/knip.js", import.meta.resolve("knip")));
    const result = spawnSync(process.execPath, [cli], { cwd: worktree, encoding: "utf8" });

    expect(result.error).toBeUndefined();
    const diagnostics = (result.stderr || result.stdout)
      .split("\n")
      .filter((line) => line.length < 500)
      .join("\n");
    expect(result.status, diagnostics).toBe(0);
  } finally {
    rmSync(checkout, { recursive: true });
  }
});
