import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const gitignore = readFileSync(resolve(repositoryRoot, ".gitignore"), "utf8");
const svelteConfig = readFileSync(resolve(repositoryRoot, "svelte.config.js"), "utf8");

describe("sprite asset boundary", () => {
  it("keeps sprites out of the static source tree", () => {
    expect(existsSync(resolve(repositoryRoot, "static/sprites"))).toBe(false);
    expect(existsSync(resolve(repositoryRoot, "static/villager-sprites"))).toBe(false);
    expect(gitignore).toContain("/static/sprites/");
    expect(gitignore).toContain("/static/villager-sprites/");
  });

  it("allows the R2 sprite origin in the image CSP", () => {
    expect(svelteConfig).toContain(
      '"img-src": ["self", "data:", "blob:", "https://assets.mistria.fyi"]',
    );
  });
});
