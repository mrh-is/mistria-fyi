import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** The shadcn `utils.ts` pulls `clsx` & `tailwind-merge` into Node, so the pipeline must avoid it. */
const SHADCN_UTILS_IMPORT = /from\s+["'](?:#lib|\$lib)\/utils(?:\.js)?["']/u;

describe("pipeline imports", () => {
  it("never import the app's shadcn utils module", () => {
    const sources = readdirSync(import.meta.dirname, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .filter((file) => file !== import.meta.filename);
    const offenders = sources.filter((file) =>
      SHADCN_UTILS_IMPORT.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
