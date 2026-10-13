/**
 * Exits before any other work when the running Node isn't `.node-version`'s release. Import it
 * first in every repository entry point, as `import "#scripts/lib/require-pinned-node";`, so a
 * bare `node` on another release fails loudly instead of running silently.
 * `scripts/lib/pinned-node.test.ts` checks that every entry point does.
 */
import { pinnedNodeMismatch, readPinnedNodeVersion } from "#scripts/lib/pinned-node";

const mismatch = pinnedNodeMismatch(process.version, readPinnedNodeVersion());
if (mismatch !== undefined) {
  process.stderr.write(`${mismatch}\n`);
  // oxlint-disable-next-line unicorn/no-process-exit -- a thrown error would print a stack trace over the message, and nothing else may run first
  process.exit(1);
}
