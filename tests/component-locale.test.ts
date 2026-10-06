import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Enforces the component locale convention in `docs/localization.md`: content components take a
 * required `locale` prop, chrome reads `page.data.locale`, and neither reads the ambient
 * `getLocale()` nor defaults the prop to "en".
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

  it("never defaults a locale prop", () => {
    const offenders = files.filter((file) =>
      /\blocale\s*=\s*["'`]/u.test(readFileSync(join(root, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
