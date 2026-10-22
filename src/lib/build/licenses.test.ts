import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { toPosixPath } from "#scripts/lib/paths";

import {
  cssImportedPackages,
  describeMissingLicenses,
  findMissingLicenses,
  LICENSES_FILE_NAME,
  licensesPlugin,
  noticeBlock,
  packageRootOf,
  readLicenseEntry,
  renderLicenses,
  uniqueEntries,
} from "./licenses.js";

import type { LicenseEntry } from "./licenses.js";
import type { Plugin } from "vite";

let project: string;

beforeEach(() => {
  project = mkdtempSync(path.join(tmpdir(), "mfg-licenses-"));
});

afterEach(() => {
  rmSync(project, { force: true, recursive: true });
});

/** Writes a package under `<project>/node_modules/<name>` & returns its root. */
function installPackage(
  name: string,
  files: Record<string, string>,
  manifest: Record<string, unknown> = {},
): string {
  const root = path.join(project, "node_modules", name);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ license: "MIT", name, version: "1.2.3", ...manifest }),
  );
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

/** A licenses plugin resolved against the temporary project. */
function configured(options: Parameters<typeof licensesPlugin>[0]): Plugin {
  const plugin = licensesPlugin(options);
  (plugin.configResolved as (config: { root: string }) => void)({ root: project });
  return plugin;
}

function entry(overrides: Partial<LicenseEntry> = {}): LicenseEntry {
  return { declared: "MIT", name: "left-pad", texts: ["MIT text"], version: "1.0.0", ...overrides };
}

describe("packageRootOf", () => {
  it("finds the package inside a pnpm store path", () => {
    expect(
      packageRootOf("/repo/node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs"),
    ).toBe("/repo/node_modules/.pnpm/clsx@2.1.1/node_modules/clsx");
  });

  it("keeps the scope in a scoped package's root", () => {
    expect(packageRootOf("/repo/node_modules/@sveltejs/kit/src/runtime/client/client.js")).toBe(
      "/repo/node_modules/@sveltejs/kit",
    );
  });

  it("resolves a nested node_modules to the inner package", () => {
    expect(packageRootOf("/repo/node_modules/outer/node_modules/inner/index.js")).toBe(
      "/repo/node_modules/outer/node_modules/inner",
    );
  });

  it("ignores query strings, virtual-module markers, & modules outside node_modules", () => {
    expect(packageRootOf("\0/repo/node_modules/svelte/src/index.js?commonjs-proxy")).toBe(
      "/repo/node_modules/svelte",
    );
    expect(packageRootOf("/repo/src/lib/utils.ts")).toBeUndefined();
    expect(packageRootOf("\0virtual:something")).toBeUndefined();
  });
});

describe("readLicenseEntry", () => {
  it("reads the declared license & every license or notice file, not other documentation", () => {
    const root = installPackage("has-license", {
      "LICENSE.md": "  Full MIT text\n",
      "NOTICE": "Attribution notice",
      "README.md": "Not a license",
    });

    expect(readLicenseEntry(root)).toEqual({
      declared: "MIT",
      name: "has-license",
      texts: ["Full MIT text", "Attribution notice"],
      version: "1.2.3",
    });
  });

  it("accepts the British spelling & the legacy license object forms", () => {
    const root = installPackage(
      "legacy",
      { LICENCE: "Text" },
      { license: undefined, licenses: [{ type: "MIT" }, { type: "Apache-2.0" }] },
    );

    expect(readLicenseEntry(root)).toMatchObject({ declared: "MIT OR Apache-2.0", texts: ["Text"] });
  });

  it("recognizes suffixed & prose-extension notices but not source files named license", () => {
    const root = installPackage("naming", {
      "LICENSE-APACHE-2.0": "Apache text",
      "LICENSE-MIT": "MIT text",
      "license.js": "export const license = 'MIT';",
      "license.txt": "Plain text",
      "licenses.json": "{}",
    });

    expect(readLicenseEntry(root).texts).toEqual(["Apache text", "MIT text", "Plain text"]);
  });

  it("reports no texts for a package that ships none, or only blank ones", () => {
    const root = installPackage("bare", { LICENSE: "  \n" });

    expect(readLicenseEntry(root).texts).toEqual([]);
  });
});

describe("findMissingLicenses", () => {
  it("returns packages with no license text", () => {
    const bare = entry({ name: "bare", texts: [] });

    expect(findMissingLicenses([entry(), bare], {})).toEqual([bare]);
  });

  it("does not treat an inherited object key as an allowlist entry", () => {
    const bare = entry({ name: "constructor", texts: [] });

    expect(findMissingLicenses([bare], {})).toEqual([bare]);
  });

  it("skips packages on the reviewed allowlist", () => {
    const bare = entry({ name: "bare", texts: [] });

    expect(findMissingLicenses([bare], { bare: "Public domain; reviewed 2026-10-20." })).toEqual([]);
  });

  it("names each offending package & the remedy", () => {
    const message = describeMissingLicenses([entry({ declared: undefined, name: "bare", texts: [] })]);

    expect(message).toContain("bare@1.0.0 (declares no license)");
    expect(message).toContain("LICENSE_ALLOWLIST");
  });
});

describe("renderLicenses", () => {
  it("lists every package with its license text, sorted by name", () => {
    const text = renderLicenses(
      [entry({ name: "zeta", texts: ["Zeta text"] }), entry({ name: "alpha", texts: ["Alpha text"] })],
      {},
    );

    expect(text.indexOf("alpha 1.0.0")).toBeLessThan(text.indexOf("zeta 1.0.0"));
    expect(text).toContain("License: MIT");
    expect(text).toContain("Alpha text");
    expect(text).toContain("Zeta text");
  });

  it("records the review reason for an allowlisted package without text", () => {
    const text = renderLicenses([entry({ name: "bare", texts: [] })], { bare: "Public domain." });

    expect(text).toContain("No license text is distributed with this package. Public domain.");
  });
});

describe("uniqueEntries", () => {
  it("collapses repeat copies of one package version but keeps distinct versions", () => {
    const entries = [entry(), entry(), entry({ version: "2.0.0" })];

    expect(uniqueEntries(entries).map((item) => item.version)).toEqual(["1.0.0", "2.0.0"]);
  });
});

describe("cssImportedPackages", () => {
  it("lists bare package imports, including scoped ones & subpaths", () => {
    const css = [
      '@import "tailwindcss";',
      "@import 'tw-animate-css';",
      '@import "@scope/pkg/theme.css";',
      '@import "./local.css";',
      '@import "../up.css";',
      '@import "tailwindcss/theme.css";',
    ].join("\n");

    expect(cssImportedPackages(css)).toEqual(["@scope/pkg", "tailwindcss", "tw-animate-css"]);
  });

  it("skips comments & URL imports", () => {
    const css = [
      '/* @import "commented-out"; */',
      '@import "https://fonts.example.com/css";',
      '@import "//cdn.example.com/a.css";',
      '@import url("https://example.com/b.css");',
      '@import "real-package";',
    ].join("\n");

    expect(cssImportedPackages(css)).toEqual(["real-package"]);
  });
});

describe("noticeBlock", () => {
  const markdown = "# Notices\n\n## One\n\n```\nfirst text\n```\n\n## Two\n\n```\nsecond\ntext\n```\n";

  it("returns the first fenced block under the heading", () => {
    expect(noticeBlock(markdown, "## Two")).toBe("second\ntext");
  });

  it("throws when the heading or its block is missing", () => {
    expect(() => noticeBlock(markdown, "## Three")).toThrow(/No fenced license text/);
    expect(() => noticeBlock("## Empty\n\nprose only\n", "## Empty")).toThrow(/No fenced/);
  });
});

describe("licensesPlugin", () => {
  type GenerateBundle = (
    this: {
      emitFile: (file: { type: string; fileName: string; source: string }) => void;
      environment: { name: string };
      error: (message: string) => never;
    },
    options: object,
    bundle: Record<string, unknown>,
  ) => void;

  function run(plugin: Plugin, environment: string, ids: string[]) {
    const emitted: { fileName: string; source: string }[] = [];
    const context = {
      emitFile: (file: { type: string; fileName: string; source: string }) => emitted.push(file),
      environment: { name: environment },
      error: (message: string): never => {
        throw new Error(message);
      },
    };
    const bundle = {
      "chunk.js": {
        type: "chunk",
        modules: Object.fromEntries(ids.map((id) => [id, { renderedLength: 10 }])),
      },
    };
    (plugin.generateBundle as GenerateBundle).call(context, {}, bundle);
    return emitted;
  }

  it("emits licenses.txt for the packages a client chunk rendered", () => {
    const root = installPackage("bundled", { LICENSE: "Bundled license text" });
    installPackage("unbundled", {}, { license: "MIT" });

    const [file] = run(configured({ allowlist: {} }), "client", [toPosixPath(path.join(root, "index.js"))]);

    expect(file.fileName).toBe(LICENSES_FILE_NAME);
    expect(file.source).toContain("bundled 1.2.3");
    expect(file.source).toContain("Bundled license text");
    expect(file.source).not.toContain("unbundled");
  });

  it("fails the build when a bundled package has no license text", () => {
    const root = installPackage("bare", {});

    expect(() => run(configured({ allowlist: {} }), "client", [toPosixPath(path.join(root, "i.js"))])).toThrow(
      /bare@1\.2\.3/,
    );
  });

  it("passes an allowlisted package without text", () => {
    const root = installPackage("bare", {});
    const plugin = configured({ allowlist: { bare: "Reviewed." } });

    const [file] = run(plugin, "client", [toPosixPath(path.join(root, "i.js"))]);

    expect(file.source).toContain("Reviewed.");
  });

  it("includes packages a listed stylesheet imports", () => {
    installPackage("css-lib", { LICENSE: "CSS lib license" });
    mkdirSync(path.join(project, "src"));
    writeFileSync(path.join(project, "src/app.css"), '@import "css-lib";\n');

    const [file] = run(configured({ allowlist: {}, stylesheets: ["src/app.css"] }), "client", []);

    expect(file.source).toContain("css-lib 1.2.3");
  });

  it("includes a scoped package a listed stylesheet imports", () => {
    installPackage("@scope/theme", { LICENSE: "Scoped license" });
    mkdirSync(path.join(project, "src"));
    writeFileSync(path.join(project, "src/app.css"), '@import "@scope/theme/base.css";\n');

    const [file] = run(configured({ allowlist: {}, stylesheets: ["src/app.css"] }), "client", []);

    expect(file.source).toContain("@scope/theme 1.2.3");
    expect(file.source).toContain("Scoped license");
  });

  it("attributes a nested package to itself, not its parent", () => {
    const outer = installPackage("outer", { LICENSE: "Outer license" });
    const inner = path.join(outer, "node_modules/inner");
    mkdirSync(inner, { recursive: true });
    writeFileSync(path.join(inner, "package.json"), '{"name":"inner","version":"9.0.0"}');
    writeFileSync(path.join(inner, "LICENSE"), "Inner license");

    const [file] = run(configured({ allowlist: {} }), "client", [
      toPosixPath(path.join(inner, "index.js")),
    ]);

    expect(file.source).toContain("inner 9.0.0");
    expect(file.source).not.toContain("outer 1.2.3");
  });

  it("lists copied code, with its license text, once a module of it rendered", () => {
    const plugin = configured({
      allowlist: {},
      vendored: [
        {
          declared: "MIT",
          licenseText: () => "Vendored MIT text",
          name: "vendored-lib",
          prefix: "src/lib/ui/",
        },
      ],
    });

    const [rendered] = run(plugin, "client", [
      toPosixPath(path.join(project, "src/lib/ui/button.svelte")),
    ]);
    const [unused] = run(plugin, "client", [toPosixPath(path.join(project, "src/lib/other.ts"))]);

    expect(rendered.source).toContain("vendored-lib");
    expect(rendered.source).toContain("Vendored MIT text");
    expect(unused.source).not.toContain("vendored-lib");
  });

  it("lists the package behind generated project code", () => {
    installPackage("generator", { LICENSE: "Generator license" });

    const [file] = run(
      configured({ allowlist: {}, generatedFrom: { "src/lib/generated/": "generator" } }),
      "client",
      [toPosixPath(path.join(project, "src/lib/generated/runtime.js"))],
    );

    expect(file.source).toContain("generator 1.2.3");
    expect(file.source).toContain("Generator license");
  });

  it("leaves the server & service worker builds alone", () => {
    const root = installPackage("bare", {});
    const plugin = configured({ allowlist: {} });
    const ids = [toPosixPath(path.join(root, "i.js"))];

    expect(run(plugin, "ssr", ids)).toEqual([]);
    expect(run(plugin, "serviceWorker", ids)).toEqual([]);
  });
});
