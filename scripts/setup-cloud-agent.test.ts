import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (
    let directory = temporaryDirectories.pop();
    directory;
    directory = temporaryDirectories.pop()
  ) {
    rmSync(directory, { force: true, recursive: true });
  }
});

// The setup script supports only the Linux containers cloud agents run in.
describe.skipIf(process.platform !== "linux")("setup-cloud-agent", () => {
  it("persists the managed Node path for login and interactive Bash shells", () => {
    const home = mkdtempSync(join(tmpdir(), "mistria-cloud-setup-"));
    temporaryDirectories.push(home);

    const binDirectory = join(home, ".local/share/mistria-node/24.21.0/bin");
    mkdirSync(binDirectory, { recursive: true });
    writeExecutable(join(binDirectory, "node"), '#!/usr/bin/env bash\nprintf "v24.21.0\\n"\n');
    writeExecutable(join(binDirectory, "pnpm"), "#!/usr/bin/env bash\nexit 0\n");

    execFileSync("bash", ["scripts/setup-cloud-agent.sh"], {
      cwd: process.cwd(),
      env: { ...process.env, HOME: home },
    });

    const pathLine = 'export PATH="$HOME/.local/share/mistria-node/current/bin:$PATH"';
    for (const startupFile of [".bash_profile", ".profile", ".bashrc"]) {
      expect(readFileSync(join(home, startupFile), "utf8")).toContain(pathLine);
    }
  });
});

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}
