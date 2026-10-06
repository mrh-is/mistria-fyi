// Runs Husky's hook install, retrying while another worktree's setup holds the shared
// `.git/config` lock. Husky returns the lock error instead of throwing and then skips generating
// `.husky/_`, so a parallel `worktree:setup` would otherwise leave this worktree without hooks
// (#567).
import { pathToFileURL } from "node:url";

const LOCK_FAILURE = "could not lock config file";
const DEFAULT_ATTEMPTS = 5;
const RETRY_DELAY_MS = 200;

export interface HookInstallResult {
  message: string;
  ok: boolean;
}

export function installGitHooks(
  install: () => string,
  wait: (ms: number) => void,
  attempts = DEFAULT_ATTEMPTS,
): HookInstallResult {
  let message = install();
  for (let attempt = 1; attempt < attempts && message.includes(LOCK_FAILURE); attempt++) {
    wait(RETRY_DELAY_MS * attempt);
    message = install();
  }
  return { message, ok: !message.includes(LOCK_FAILURE) };
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { default: husky } = await import("husky");
  const { message, ok } = installGitHooks(() => husky(), sleep);
  if (message) {
    (ok ? process.stdout : process.stderr).write(`${message.trimEnd()}\n`);
  }
  if (!ok) {
    process.exitCode = 1;
  }
}
