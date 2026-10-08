import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

const script = new URL("setup-worktree.sh", import.meta.url);
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function fixture(platform = "Darwin") {
  const directory = mkdtempSync(join(tmpdir(), "mistria-setup-"));
  directories.push(directory);
  const main = join(directory, "main");
  const worktree = join(directory, "worktree");
  const bin = join(directory, "bin");
  mkdirSync(main);
  mkdirSync(bin);
  execFileSync("git", ["init", main], { stdio: "pipe" });
  writeFileSync(join(main, ".worktreeinclude"), "");
  execFileSync(
    "git",
    [
      "-C",
      main,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--allow-empty",
      "-m",
      "Fixture",
    ],
    { stdio: "pipe" },
  );
  execFileSync("git", ["-C", main, "worktree", "add", "--detach", worktree], { stdio: "pipe" });
  const log = join(directory, "calls");
  writeFileSync(join(bin, "uname"), `#!/bin/sh\necho ${platform}\n`);
  writeFileSync(
    join(bin, "pnpm"),
    // Shell parameter expansion is intentional in this fixture.
    // oxlint-disable-next-line no-template-curly-in-string
    '#!/bin/sh\nprintf \'%s|%s|%s|%s\\n\' "$*" "${npm_config_store_dir-}" "${pnpm_config_store_dir-}" "${pnpm_config_confirm_modules_purge-}" >> "$SETUP_TEST_LOG"\n',
  );
  chmodSync(join(bin, "uname"), 0o755);
  chmodSync(join(bin, "pnpm"), 0o755);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CODEX_THREAD_ID: "fixture",
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    SETUP_TEST_LOG: log,
  };
  delete env.npm_config_store_dir;
  delete env.pnpm_config_store_dir;
  delete env.pnpm_config_confirm_modules_purge;
  return {
    env,
    read: () => readFileSync(log, "utf8"),
    run: () => spawnSync("bash", [script.pathname], { cwd: worktree, encoding: "utf8", env }),
  };
}

it("pins install & prepare to the same external store across retries without a TTY", () => {
  const test = fixture();
  expect(test.run().status).toBe(0);
  expect(test.run().status).toBe(0);
  expect(test.read().trim().split("\n")).toEqual([
    "install --frozen-lockfile --store-dir /private/tmp/codex-pnpm-store --config.confirmModulesPurge=false|/private/tmp/codex-pnpm-store|/private/tmp/codex-pnpm-store|false",
    "run prepare|/private/tmp/codex-pnpm-store|/private/tmp/codex-pnpm-store|false",
    "install --frozen-lockfile --store-dir /private/tmp/codex-pnpm-store --config.confirmModulesPurge=false|/private/tmp/codex-pnpm-store|/private/tmp/codex-pnpm-store|false",
    "run prepare|/private/tmp/codex-pnpm-store|/private/tmp/codex-pnpm-store|false",
  ]);
});

it("preserves an explicit store override", () => {
  const test = fixture();
  test.env.pnpm_config_store_dir = "/private/tmp/custom-pnpm-store";
  test.env.npm_config_store_dir = "/private/tmp/legacy-pnpm-store";
  expect(test.run().status).toBe(0);
  expect(test.read()).toContain(
    "|/private/tmp/custom-pnpm-store|/private/tmp/custom-pnpm-store|false",
  );
});

it("leaves cloud pnpm settings alone", () => {
  const test = fixture("Linux");
  expect(test.run().status).toBe(0);
  expect(test.read()).toBe("install --frozen-lockfile|||\nrun prepare|||\n");
});
