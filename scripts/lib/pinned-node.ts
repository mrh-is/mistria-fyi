import { readFileSync } from "node:fs";

/**
 * Explains why `running` can't run repository code, or returns `undefined` when it matches the
 * pinned release. Every pnpm script & `pnpm exec` gets the pinned release from `package.json`'s
 * `devEngines.runtime`, so a mismatch means something ran `node` (or a package binary) directly.
 */
export function pinnedNodeMismatch(running: string, pinned: string): string | undefined {
  const runningVersion = running.replace(/^v/u, "");
  if (runningVersion === pinned) {
    return undefined;
  }
  return [
    `error: Node ${runningVersion} is running this script, but .node-version pins ${pinned}.`,
    "Run it through pnpm, which supplies the pinned Node: `pnpm run <script>`, or",
    "`pnpm exec node <file>` for a file without a script. Run `pnpm install` first if",
    "`pnpm exec node -v` doesn't print the pinned version.",
  ].join("\n");
}

/** Reads `.node-version` from the repository root. */
export function readPinnedNodeVersion(): string {
  return readFileSync(new URL("../../.node-version", import.meta.url), "utf8").trim();
}
