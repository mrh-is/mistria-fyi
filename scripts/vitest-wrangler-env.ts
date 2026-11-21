import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Choose where Wrangler's platform proxy stores its local bindings. */
export function resolvePlatformProxyPersistence(
  env: NodeJS.ProcessEnv = process.env,
): false | undefined | { path: string } {
  // Concurrent Vitest invocations must not open the same SQLite files (#510).
  if (env.VITEST === "true") return false;

  // Playwright preview servers need persistent state, isolated by port (#19).
  const previewDirectory = env.MISTRIA_PREVIEW_PERSIST_DIR;
  return previewDirectory ? { path: previewDirectory } : undefined;
}

/**
 * Keep dev & preview servers' Wrangler writes in the checkout's gitignored `.wrangler/`. Wrangler
 * otherwise writes its worker registry & logs under the user's preferences directory, which agent
 * sandboxes deny (#420). The app binds no other workers, so a per-checkout registry loses nothing.
 */
export function configureLocalWranglerEnv(
  checkout: string,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.VITEST === "true") return;
  env.WRANGLER_REGISTRY_PATH ??= join(checkout, ".wrangler", "registry");
  env.WRANGLER_LOG_PATH ??= join(checkout, ".wrangler", "logs");
}

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
