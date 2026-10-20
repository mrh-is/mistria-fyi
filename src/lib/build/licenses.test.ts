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
  manifest: Record<string, unknown> = { license: "MIT" },
): string {
  const root = path.join(project, "node_modules", name);
  mkdirSync(root, { recursive: true });
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name, version: "1.2.3", ...manifest }));
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(path.join(root, file), text);
  }
  return root;
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
});

describe("licensesPlugin", () => {
  type GenerateBundle = (
    this: {
      emitFile(file: { fileName: string; source: string; type: string }): void;
      environment: { name: string };
      error(message: string): never;
    },
    options: object,
    bundle: Record<string, unknown>,
  ) => void;

  function run(plugin: Plugin, environment: string, ids: string[]) {
    const emitted: { fileName: string; source: string }[] = [];
    const context = {
      emitFile: (file: { fileName: string; source: string; type: string }) => emitted.push(file),
      environment: { name: environment },
      error: (message: string): never => {
        throw new Error(message);
      },
    };
    const bundle = {
      "chunk.js": {
        modules: Object.fromEntries(ids.map((id) => [id, { renderedLength: 10 }])),
        type: "chunk",
      },
    };
    (plugin.generateBundle as GenerateBundle).call(context, {}, bundle);
    return emitted;
  }

  function configured(options: Parameters<typeof licensesPlugin>[0]): Plugin {
    const plugin = licensesPlugin(options);
    (plugin.configResolved as (config: { root: string }) => void)({ root: project });
    return plugin;
  }

  it("emits licenses.txt for the packages a client chunk rendered", () => {
    const root = installPackage("bundled", { LICENSE: "Bundled license text" });
    installPackage("unbundled", {}, { license: "MIT" });

    const [file] = run(configured({ allowlist: {} }), "client", [toPosixPath(path.join(root, "index.js"))]);

    expect(file?.fileName).toBe(LICENSES_FILE_NAME);
    expect(file?.source).toContain("bundled 1.2.3");
    expect(file?.source).toContain("Bundled license text");
    expect(file?.source).not.toContain("unbundled");
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

    expect(file?.source).toContain("Reviewed.");
  });

  it("includes packages a listed stylesheet imports", () => {
    installPackage("css-lib", { LICENSE: "CSS lib license" });
    mkdirSync(path.join(project, "src"));
    writeFileSync(path.join(project, "src/app.css"), '@import "css-lib";\n');

    const [file] = run(configured({ allowlist: {}, stylesheets: ["src/app.css"] }), "client", []);

    expect(file?.source).toContain("css-lib 1.2.3");
  });

  it("leaves the server & service worker builds alone", () => {
    const root = installPackage("bare", {});

    expect(run(configured({ allowlist: {} }), "ssr", [toPosixPath(path.join(root, "i.js"))])).toEqual([]);
  });
});
