// docs/agent-reference.md, code conventions: files are `kebab-case`. SvelteKit's `+`-prefixed
// route files & `[param]`/`(group)` directories are framework syntax, so only the part after those
// markers is checked.
import { describe, expect, it } from "vitest";

import { sourceFilenameOffenders } from "./source-filenames.js";

describe("source filenames", () => {
  it("are kebab-case for .svelte & .ts files under src/", () => {
    expect(sourceFilenameOffenders("src")).toStrictEqual([]);
  });
});
