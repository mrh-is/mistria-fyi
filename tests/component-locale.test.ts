import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Enforces the component locale convention in `docs/localization.md`: content components take a
 * required `locale` prop, chrome reads `page.data.locale`, and neither reads the ambient
 * `getLocale()` nor defaults the prop to anything. The default check inspects `$props()`
 * destructuring only; a `locale="en"` attribute in markup is a deliberate literal (a test harness
 * or fixed-locale caller) and is not flagged.
 */

const root = join(import.meta.dirname, "..");

// Pending conversion; the file is in another agent's open work. Remove once converted.
const AMBIENT_READ_ALLOWLIST = new Set(["src/lib/components/expandable-section.svelte"]);

function svelteFiles(directory: string): string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".svelte") &&
        !entry.name.endsWith(".test-harness.svelte"),
    )
    .map((entry) => relative(root, join(entry.parentPath, entry.name)));
}

const files = [
  ...svelteFiles(join(root, "src/lib/components")),
  ...svelteFiles(join(root, "src/routes")),
].filter((file) => !file.includes("/ui/"));

describe("component locale convention", () => {
  it("scans components", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("never reads the ambient locale", () => {
    const offenders = files.filter(
      (file) =>
        !AMBIENT_READ_ALLOWLIST.has(file) &&
        /\bgetLocale\b/u.test(readFileSync(join(root, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps the allowlist free of converted files", () => {
    const stale = [...AMBIENT_READ_ALLOWLIST].filter(
      (file) => !/\bgetLocale\b/u.test(readFileSync(join(root, file), "utf8")),
    );
    expect(
      stale,
      "These files no longer read getLocale(); remove them from AMBIENT_READ_ALLOWLIST",
    ).toEqual([]);
  });

  it("never defaults a locale prop", () => {
    const offenders = files.filter((file) => {
      const destructuring = /let\s*\{([^}]*)\}[^;]*?=\s*\$props\(\)/u.exec(
        readFileSync(join(root, file), "utf8"),
      );
      return destructuring !== null && /\blocale\s*=/u.test(destructuring[1]);
    });
    expect(offenders).toEqual([]);
  });
});
