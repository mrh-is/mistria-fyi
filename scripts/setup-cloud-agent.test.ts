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

    const binDirectory = join(home, ".local/share/mistria-node/26.5.0/bin");
    mkdirSync(binDirectory, { recursive: true });
    writeExecutable(join(binDirectory, "node"), '#!/usr/bin/env bash\nprintf "v26.5.0\\n"\n');
    writeExecutable(join(binDirectory, "pnpm"), "#!/usr/bin/env bash\nexit 0\n");

    const environment = { ...process.env, HOME: home };
    delete environment.CODEX_ENV_NODE_VERSION;
    execFileSync("bash", ["scripts/setup-cloud-agent.sh"], {
      cwd: process.cwd(),
      env: environment,
    });

    const pathLine = 'export PATH="$HOME/.local/share/mistria-node/current/bin:$PATH"';
    for (const startupFile of [".bash_profile", ".profile", ".bashrc"]) {
      expect(readFileSync(join(home, startupFile), "utf8")).toContain(pathLine);
    }
  });

  it("keeps the Codex runtime path on the repository-managed Node version", () => {
    const home = mkdtempSync(join(tmpdir(), "mistria-codex-setup-"));
    temporaryDirectories.push(home);

    const managedBin = join(home, ".local/share/mistria-node/26.5.0/bin");
    mkdirSync(managedBin, { recursive: true });
    writeExecutable(join(managedBin, "node"), '#!/usr/bin/env bash\nprintf "v26.5.0\\n"\n');

    const platformBin = join(home, ".nvm/versions/node/v22.22.2/bin");
    mkdirSync(platformBin, { recursive: true });
    writeExecutable(join(platformBin, "node"), '#!/usr/bin/env bash\nprintf "v22.22.2\\n"\n');
    writeExecutable(join(platformBin, "pnpm"), "#!/usr/bin/env bash\nexit 0\n");

    execFileSync("bash", ["scripts/setup-cloud-agent.sh"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CODEX_ENV_NODE_VERSION: "22",
        HOME: home,
        PATH: `${platformBin}:${process.env.PATH}`,
      },
    });

    expect(execFileSync(join(platformBin, "node"), { encoding: "utf8" }).trim()).toBe("v26.5.0");
    expect(
      execFileSync(`${join(platformBin, "node")}.codex-platform`, { encoding: "utf8" }).trim(),
    ).toBe("v22.22.2");
  });
});

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}
