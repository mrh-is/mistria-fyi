// Run ShellCheck over every tracked shell script. ShellCheck comes from the system: Homebrew
// locally, the runner image in CI, and apt in cloud checkouts (scripts/setup-cloud-agent.sh).
// A Node script rather than a shell one so `pnpm run lint` also works on Windows, where `cmd.exe`
// can't execute a `.sh` path (#723).
import "#scripts/lib/require-pinned-node";

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const INSTALL_HINT: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "brew install shellcheck",
  linux: "apt-get install shellcheck",
  win32: "winget install koalaman.shellcheck",
};

function main(): number {
  const files = spawnSync("git", ["ls-files", "-z", "*.sh"], { encoding: "utf8" });
  if (files.status !== 0) {
    console.error(files.stderr.trim() || "error: git ls-files failed");
    return files.status ?? 1;
  }
  const scripts = files.stdout.split("\0").filter(Boolean);
  if (scripts.length === 0) {
    return 0;
  }

  const result = spawnSync("shellcheck", scripts, { stdio: "inherit" });
  const error: NodeJS.ErrnoException | undefined = result.error;
  if (error?.code === "ENOENT") {
    const hint = INSTALL_HINT[process.platform] ?? INSTALL_HINT.linux;
    console.error(`error: shellcheck is not installed; run \`${String(hint)}\``);
    return 1;
  }
  if (error) {
    console.error(`error: could not run shellcheck: ${error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
