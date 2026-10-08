import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Keep Vitest's Cloudflare proxy writes out of the user's preferences directory (#659). */
export function configureVitestWranglerEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (
    env.VITEST !== "true" ||
    (env.XDG_CONFIG_HOME !== undefined && env.WRANGLER_LOG_PATH !== undefined)
  ) {
    return undefined;
  }

  // One directory per invocation avoids worker-registry collisions across concurrent worktrees.
  // Child test processes inherit these paths, so they do not allocate their own directories.
  const directory = mkdtempSync(join(tmpdir(), "mistria-vitest-wrangler-"));
  env.XDG_CONFIG_HOME ??= join(directory, "config");
  env.WRANGLER_LOG_PATH ??= join(directory, "logs");
  return directory;
}
