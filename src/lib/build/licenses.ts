import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import type { Plugin } from "vite";

/** Where the build publishes the notices; the About page links here. */
export const LICENSES_FILE_NAME = "licenses.txt";

/**
 * Bundled packages whose license text is knowingly absent, keyed by package name, each with the
 * reason it was reviewed & accepted. Adding one is a deliberate decision: say where the license
 * text lives instead & why shipping without it is fine.
 */
export const LICENSE_ALLOWLIST: Readonly<Record<string, string>> = {};

/** Filenames that carry a license grant or notice, as npm & GitHub conventionally name them. */
const LICENSE_FILE = /^(?:licen[cs]e|copying|notice)(?:[-._].*)?$/iu;

export interface LicenseEntry {
  /** The `license` field of the package's `package.json`, when it declares one. */
  declared: string | undefined;
  name: string;
  /** Contents of each license or notice file found in the package root. */
  texts: string[];
  version: string;
}

/**
 * The package root a bundled module belongs to: the nearest ancestor directory whose parent is
 * `node_modules` (or a scope directory inside it). Module ids use `/` on every platform, so this
 * stays on `path.posix`. Returns `undefined` for modules outside `node_modules`.
 */
export function packageRootOf(moduleId: string): string | undefined {
  const file = moduleId.replace(/^\0/u, "").replace(/[?#].*$/u, "");
  let directory = path.posix.dirname(file);
  while (directory !== path.posix.dirname(directory)) {
    const parent = path.posix.dirname(directory);
    if (path.posix.basename(parent) === "node_modules") return directory;
    if (
      path.posix.basename(parent).startsWith("@") &&
      path.posix.basename(path.posix.dirname(parent)) === "node_modules"
    ) {
      return directory;
    }
    directory = parent;
  }
  return undefined;
}

function declaredLicense(manifest: Record<string, unknown>): string | undefined {
  const { license, licenses } = manifest;
  if (typeof license === "string") return license;
  if (typeof license === "object" && license !== null && "type" in license) {
    return String(license.type);
  }
  if (Array.isArray(licenses)) {
    const types = licenses.map((entry: unknown) =>
      typeof entry === "object" && entry !== null && "type" in entry ? String(entry.type) : "",
    );
    return types.filter(Boolean).join(" OR ") || undefined;
  }
  return undefined;
}

/** Reads one package's name, version, declared license, & license files from its root. */
export function readLicenseEntry(root: string): LicenseEntry {
  const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  const texts = readdirSync(root)
    .filter((file) => LICENSE_FILE.test(file) && statSync(path.join(root, file)).isFile())
    .sort()
    .map((file) => readFileSync(path.join(root, file), "utf8").trim())
    .filter((text) => text.length > 0);
  return {
    declared: declaredLicense(manifest),
    name: String(manifest.name ?? path.basename(root)),
    texts,
    version: String(manifest.version ?? "0.0.0"),
  };
}

/** Drops repeat copies of one package version (pnpm can install the same version twice). */
export function uniqueEntries(entries: readonly LicenseEntry[]): LicenseEntry[] {
  return [...new Map(entries.map((entry) => [`${entry.name}@${entry.version}`, entry])).values()];
}

/** Entries with no license text whose package the allowlist does not cover. */
export function findMissingLicenses(
  entries: readonly LicenseEntry[],
  allowlist: Readonly<Record<string, string>> = LICENSE_ALLOWLIST,
): LicenseEntry[] {
  return entries.filter((entry) => entry.texts.length === 0 && !(entry.name in allowlist));
}

export function describeMissingLicenses(missing: readonly LicenseEntry[]): string {
  const list = missing
    .map((entry) => `  ${entry.name}@${entry.version} (declares ${entry.declared ?? "no license"})`)
    .join("\n");
  return (
    `Bundled packages ship no license text:\n${list}\n` +
    "Add a license file upstream, or list the package in LICENSE_ALLOWLIST " +
    "(src/lib/build/licenses.ts) with the reason it was reviewed."
  );
}

/** The `licenses.txt` body: one block per package, sorted by name & version. */
export function renderLicenses(
  entries: readonly LicenseEntry[],
  allowlist: Readonly<Record<string, string>> = LICENSE_ALLOWLIST,
): string {
  const rule = "=".repeat(72);
  const blocks = [...entries]
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
    .map((entry) => {
      const heading = `${entry.name} ${entry.version}`;
      const declared = entry.declared === undefined ? "" : `License: ${entry.declared}\n`;
      const body =
        entry.texts.length > 0
          ? entry.texts.join("\n\n")
          : `No license text is distributed with this package. ${allowlist[entry.name] ?? ""}`.trim();
      return `${heading}\n${declared}\n${body}`;
    });
  return (
    "Open-source licenses for the packages bundled into the Mistria Field Guide client.\n\n" +
    `${rule}\n\n${blocks.join(`\n\n${rule}\n\n`)}\n`
  );
}

/**
 * Packages a stylesheet pulls in with a bare `@import "name"`. Tailwind & friends inline their CSS
 * into the client stylesheet without adding a JavaScript module, so the chunk scan never sees them.
 */
export function cssImportedPackages(css: string): string[] {
  const names = new Set<string>();
  for (const match of css.matchAll(/@import\s+["'](@[^/"'\s]+\/[^/"'\s]+|[^@./"'\s][^/"'\s]*)/gu)) {
    names.add(match[1] ?? "");
  }
  return [...names].sort();
}

export interface LicensesPluginOptions {
  allowlist?: Readonly<Record<string, string>>;
  /** Stylesheets (relative to the project root) whose bare `@import`s ship in the bundle. */
  stylesheets?: readonly string[];
}

/**
 * Publishes `licenses.txt` with the client bundle & fails the build when a bundled package ships
 * no license text. "Bundled" means a package with at least one module that rendered code into a
 * client chunk, or one a listed stylesheet imports, so build-only tooling & tree-shaken imports
 * stay out of the notice.
 */
export function licensesPlugin({
  allowlist = LICENSE_ALLOWLIST,
  stylesheets = [],
}: LicensesPluginOptions = {}): Plugin {
  let projectRoot = process.cwd();
  return {
    apply: "build",
    configResolved(config) {
      projectRoot = config.root;
    },
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      const roots = new Set<string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const [id, rendered] of Object.entries(output.modules)) {
          if (rendered.renderedLength === 0) continue;
          const root = packageRootOf(id);
          if (root !== undefined) roots.add(root);
        }
      }
      for (const stylesheet of stylesheets) {
        const css = readFileSync(path.resolve(projectRoot, stylesheet), "utf8");
        for (const name of cssImportedPackages(css)) {
          roots.add(realpathSync(path.join(projectRoot, "node_modules", name)));
        }
      }
      const entries = uniqueEntries([...roots].map((root) => readLicenseEntry(root)));
      const missing = findMissingLicenses(entries, allowlist);
      if (missing.length > 0) this.error(describeMissingLicenses(missing));
      this.emitFile({
        fileName: LICENSES_FILE_NAME,
        source: renderLicenses(entries, allowlist),
        type: "asset",
      });
    },
    name: "mfg:licenses",
  };
}
