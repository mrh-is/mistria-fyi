import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const appCss = readFileSync(resolve(repositoryRoot, "src/app.css"), "utf8");
const gitignore = readFileSync(resolve(repositoryRoot, ".gitignore"), "utf8");
const notices = readFileSync(resolve(repositoryRoot, "THIRD-PARTY-NOTICES.md"), "utf8");
const svelteConfig = readFileSync(resolve(repositoryRoot, "svelte.config.js"), "utf8");

describe("proprietary font boundary", () => {
  it("prefers a local Satoshi installation and falls back to the R2-hosted copy", () => {
    expect(appCss).toContain('local("Satoshi Regular")');
    expect(appCss).toContain(
      'url("https://assets.mistria.fyi/fonts/satoshi-regular.woff2") format("woff2")',
    );
    expect(svelteConfig).toContain('"https://assets.mistria.fyi"');
  });

  it("excludes the local font file from the source license boundary", () => {
    expect(gitignore).toContain("/static/fonts/satoshi-regular.woff2");
    expect(notices).toContain("is not distributed through this source repository");
  });
});
