import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BARE_PATHS, renderBarePathStub } from "../i18n/bare-path-stub.js";
import { LOCALE_CODES } from "../types/locale.js";
import { REDIRECTS_RULE_LIMIT, renderRedirectsFile, withBarePathStubs } from "./bare-path-stubs.js";

import type { Adapter, Builder } from "@sveltejs/kit";

/** The rules in a `_redirects` file, as `[source, target, status]`. */
function rules(content: string): string[][] {
  return content
    .split("\n")
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line) => line.split(/\s+/));
}

describe("renderRedirectsFile", () => {
  it("permanently redirects each locale's lowercase & uppercase prefix to its canonical casing", () => {
    const content = renderRedirectsFile();

    expect(rules(content)).toContainEqual(["/zh-hans", "/zh-Hans", "308"]);
    expect(rules(content)).toContainEqual(["/zh-hans/*", "/zh-Hans/:splat", "308"]);
    expect(rules(content)).toContainEqual(["/ZH-HANT/*", "/zh-Hant/:splat", "308"]);
    expect(rules(content)).toContainEqual(["/EN/*", "/en/:splat", "308"]);
  });

  it("never redirects a canonical prefix, which would loop", () => {
    const sources = new Set(rules(renderRedirectsFile()).map(([source]) => source));
    for (const locale of LOCALE_CODES) {
      expect(sources).not.toContain(`/${locale}`);
      expect(sources).not.toContain(`/${locale}/*`);
    }
  });

  it("stays within Pages' dynamic rule cap", () => {
    expect(rules(renderRedirectsFile()).length).toBeLessThanOrEqual(REDIRECTS_RULE_LIMIT);
  });
});

describe("withBarePathStubs", () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory !== undefined) rmSync(directory, { force: true, recursive: true });
  });

  function fakeBuilder(): Builder {
    return {
      prerendered: {
        pages: new Map([["/en/data", { file: "en/data.html" }]]),
        paths: ["/en/data"],
      },
      writePrerendered(dest: string) {
        mkdirSync(path.join(dest, "en"), { recursive: true });
        writeFileSync(path.join(dest, "en", "data.html"), "<p>data</p>");
        return ["en/data.html"];
      },
    } as unknown as Builder;
  }

  it("writes _redirects before the adapter copies it", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "bare-path-stubs-"));
    const projectDirectory = directory;
    let seenByAdapter: string | undefined;
    const inner: Adapter = {
      adapt: vi.fn(() => {
        seenByAdapter = readFileSync(path.join(projectDirectory, "_redirects"), "utf8");
      }),
      name: "inner",
    };

    const adapter = withBarePathStubs(inner, projectDirectory);
    expect(adapter.name).toBe("inner");
    await adapter.adapt(fakeBuilder());

    expect(seenByAdapter).toBe(renderRedirectsFile());
  });

  it("writes a stub per bare path wherever the adapter writes prerendered pages", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "bare-path-stubs-"));
    const output = path.join(directory, "build");
    let written: string[] = [];
    let pages: string[] = [];
    const inner: Adapter = {
      adapt(builder) {
        written = builder.writePrerendered(output);
        pages = [...builder.prerendered.pages.keys()];
      },
      name: "inner",
    };

    await withBarePathStubs(inner, directory).adapt(fakeBuilder());

    expect(readFileSync(path.join(output, "en", "data.html"), "utf8")).toBe("<p>data</p>");
    expect(readFileSync(path.join(output, "index.html"), "utf8")).toBe(renderBarePathStub("/"));
    expect(readFileSync(path.join(output, "almanac.html"), "utf8")).toBe(
      renderBarePathStub("/almanac"),
    );
    expect(written).toEqual(expect.arrayContaining(["en/data.html", "index.html", "almanac.html"]));
    // Listed as prerendered pages, so `withHeadersFile` gives each stub's script a CSP hash.
    expect(pages).toEqual(["/en/data", ...BARE_PATHS]);
  });
});
