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

export default class RelayFirstSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    // oxlint-disable-next-line unicorn/no-array-sort -- Vitest's sequencer API names this method sort; it is not Array.sort.
    return prioritizeRelay(await super.sort(files));
  }
}
