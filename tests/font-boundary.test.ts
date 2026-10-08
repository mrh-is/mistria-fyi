import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CSP_DIRECTIVES } from "#lib/security/csp-directives.js";

const repositoryRoot = resolve(import.meta.dirname, "..");
const appCss = readFileSync(resolve(repositoryRoot, "src/app.css"), "utf8");
const notices = readFileSync(resolve(repositoryRoot, "THIRD-PARTY-NOTICES.md"), "utf8");

describe("proprietary font boundary", () => {
  it("prefers a local Satoshi installation and falls back to the R2-hosted copy", () => {
    expect(appCss).toContain('local("Satoshi Regular")');
    expect(appCss).toContain(
      'url("https://assets.mistria.fyi/fonts/satoshi-regular.woff2") format("woff2")',
    );
    expect(CSP_DIRECTIVES["font-src"]).toContain("https://assets.mistria.fyi");
  });

  it("excludes the local font file from the source license boundary", () => {
    // `git check-ignore` exits nonzero, so execFileSync throws, when the path is not ignored.
    expect(() =>
      execFileSync("git", ["check-ignore", "--quiet", "static/fonts/satoshi-regular.woff2"], {
        cwd: repositoryRoot,
      }),
    ).not.toThrow();
    expect(() =>
      execFileSync(
        "git",
        ["check-ignore", "--quiet", "tests/browser/fixtures/local/satoshi-regular.woff2"],
        { cwd: repositoryRoot },
      ),
    ).not.toThrow();
    expect(notices).toContain("is not distributed through this source repository");
  });
});
