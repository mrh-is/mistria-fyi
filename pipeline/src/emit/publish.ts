import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface StagedFile {
  content: string;
  path: string;
}

/** Writes staged text outputs to disk. Call only after every pipeline validation passes. */
export function publishFiles(staged: readonly StagedFile[]): void {
  for (const { content, path } of staged) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}
