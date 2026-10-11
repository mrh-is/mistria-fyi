import { readdirSync } from "node:fs";
import { sep } from "node:path";
import { describe, expect, it } from "vitest";

import { accessibilityRoutes } from "./routes.js";

/** Developer-only tools that ship no user-facing page, so the browser suites skip them. */
const EXCLUDED_PREFIXES = ["/dev/"];

/** Public paths derived from `src/routes`: every `+page.svelte` or `+page.ts`, minus route groups. */
function applicationRoutes(): string[] {
  const paths = new Set<string>();
  for (const entry of readdirSync("src/routes", { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !/^\+page\.(svelte|ts)$/.test(entry.name)) continue;
    const segments = entry.parentPath
      .split(sep)
      .join("/")
      .replace(/^src\/routes\/?/, "")
      .split("/")
      .filter((segment) => segment !== "" && !/^\(.*\)$/.test(segment));
    paths.add(`/${segments.join("/")}`);
  }
  return [...paths]
    .filter((path) => !EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix)))
    .toSorted();
}

describe("accessibility route list", () => {
  it("covers every page under src/routes and nothing else", () => {
    expect(accessibilityRoutes.map((route) => route.path).toSorted()).toEqual(applicationRoutes());
  });
});
