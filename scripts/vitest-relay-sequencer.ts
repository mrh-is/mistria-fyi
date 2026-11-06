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

const isSharedClient = (file: { project: { name: string } }) => file.project.name === "client";

/**
 * Varies which shared client file follows which without moving the relay or reshuffling the other
 * projects. It sorts by a seeded hash of each path, so a seed works with cold & warm caches.
 */
export function shuffleSharedClientFiles<T extends { moduleId: string; project: { name: string } }>(
  files: readonly T[],
  seed: number,
  root: string,
): T[] {
  const shuffled = files
    .filter((file) => isSharedClient(file))
    .map((file) => ({
      file,
      key: createHash("sha256")
        .update(`${seed}:${path.relative(root, file.moduleId)}`)
        .digest("hex"),
    }))
    .toSorted((a, b) => a.key.localeCompare(b.key))
    .map(({ file }) => file)
    .values();
  return files.map((file) => (isSharedClient(file) ? (shuffled.next().value ?? file) : file));
}

export default class RelayFirstSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    // oxlint-disable-next-line unicorn/no-array-sort -- Vitest's sequencer API names this method sort; it is not Array.sort.
    const ordered = prioritizeRelay(await super.sort(files));
    if (!process.env.CI || files.filter((file) => isSharedClient(file)).length < 2) return ordered;

    const { root, sequence } = this.ctx.config;
    this.ctx.logger.log(`Shuffling shared client files with seed ${sequence.seed}`);
    return shuffleSharedClientFiles(ordered, sequence.seed, root);
  }
}
