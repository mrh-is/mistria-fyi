import { createHash } from "node:crypto";
import path from "node:path";
import { BaseSequencer } from "vitest/node";

import type { TestSpecification } from "vitest/node";

/** Overlap workerd's eviction & socket-close waits with the ordinary test files. */
export function prioritizeRelay<T extends { moduleId: string }>(files: readonly T[]): T[] {
  const isRelay = (file: T) =>
    path.basename(file.moduleId) === "worker.test.ts" &&
    path.basename(path.dirname(file.moduleId)) === "relay";
  return [...files.filter((file) => isRelay(file)), ...files.filter((file) => !isRelay(file))];
}

const isSharedClient = (file: TestSpecification) => file.project.name === "client";

export default class RelayFirstSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    // oxlint-disable-next-line unicorn/no-array-sort -- Vitest's sequencer API names this method sort; it is not Array.sort.
    const ordered = prioritizeRelay(await super.sort(files));
    if (!process.env.CI) return ordered;

    // Vary which shared client file follows which without moving the relay or reshuffling the
    // other projects. Sort by a seeded hash of each path so the seed works with cold & warm caches.
    const { root, sequence } = this.ctx.config;
    const clientFiles = files.filter((file) => isSharedClient(file));
    if (clientFiles.length < 2) return ordered;
    this.ctx.logger.log(`Shuffling shared client files with seed ${sequence.seed}`);
    const shuffled = clientFiles
      .map((file) => ({
        file,
        key: createHash("sha256")
          .update(`${sequence.seed}:${path.relative(root, file.moduleId)}`)
          .digest("hex"),
      }))
      .toSorted((a, b) => a.key.localeCompare(b.key))
      .map(({ file }) => file)
      .values();
    return ordered.map((file) => (isSharedClient(file) ? (shuffled.next().value ?? file) : file));
  }
}
