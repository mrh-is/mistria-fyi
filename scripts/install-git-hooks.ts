import "#scripts/lib/require-pinned-node";

import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function installGitHooks(root: string, husky: string | undefined): void {
  if (husky === "0") {
    return;
  }

  const hooks = join(root, ".husky", "_");
  mkdirSync(hooks, { recursive: true });
  writeFileSync(join(hooks, ".gitignore"), "*\n");
  // Keep Husky's launcher and user init behavior. Only pre-commit is used by this repo.
  const launcher = new URL("husky", import.meta.resolve("husky"));
  copyFileSync(fileURLToPath(launcher), join(hooks, "h"));
  writeFileSync(join(hooks, "pre-commit"), '#!/usr/bin/env sh\n. "$(dirname "$0")/h"\n', {
    mode: 0o755,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  installGitHooks(process.cwd(), process.env.HUSKY);
}
