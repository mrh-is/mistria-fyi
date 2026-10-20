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

/**
 * Filenames that carry a license grant or notice: `LICENSE`, `LICENCE`, `COPYING`, or `NOTICE`, with
 * an optional `-<ID>` suffix (`LICENSE-MIT`, `LICENSE-APACHE-2.0`) & an optional prose extension.
 * Source files such as `license.js` are not notices.
 */
const LICENSE_FILE =
  /^(?:licen[cs]e|copying|notice)(?:-[a-z0-9+-]+(?:\.\d+)*)?(?:\.(?:md|txt|markdown|rst))?$/iu;

export interface LicenseEntry {
  /** The `license` field of the package's `package.json`, when it declares one. */
  declared: string | undefined;
  name: string;
  /** Contents of each license or notice file found in the package root. */
  texts: string[];
  /** Empty for code copied into the project, which has no version of its own. */
  version: string;
}

/**
 * The package root a bundled module belongs to: the nearest ancestor directory whose parent is
 * `node_modules` (or a scope directory inside it), so a nested `node_modules` resolves to the inner
 * package. Module ids use `/` on every platform, so this stays on `path.posix`. Returns `undefined`
 * for modules outside `node_modules`.
 */
export function packageRootOf(moduleId: string): string | undefined {
  const file = cleanModuleId(moduleId);
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

/** A module id without the virtual-module marker or a query/fragment suffix. */
function cleanModuleId(moduleId: string): string {
  return moduleId.replace(/^\0/u, "").replace(/[?#].*$/u, "");
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
    .sort(compareText)
    .map((file) => readFileSync(path.join(root, file), "utf8").trim())
    .filter((text) => text.length > 0);
  return {
    declared: declaredLicense(manifest),
    name: String(manifest.name ?? path.basename(root)),
    texts,
    version: String(manifest.version ?? "0.0.0"),
  };
}

/** Code-unit order, so the output never depends on the build machine's locale. */
function compareText(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
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
  return entries.filter(
    (entry) => entry.texts.length === 0 && !Object.hasOwn(allowlist, entry.name),
  );
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
    .sort((a, b) => compareText(a.name, b.name) || compareText(a.version, b.version))
    .map((entry) => {
      const heading = `${entry.name} ${entry.version}`.trim();
      const declared = entry.declared === undefined ? "" : `License: ${entry.declared}\n`;
      const reason = Object.hasOwn(allowlist, entry.name) ? (allowlist[entry.name] ?? "") : "";
      const body =
        entry.texts.length > 0
          ? entry.texts.join("\n\n")
          : `No license text is distributed with this package. ${reason}`.trim();
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
 * Comments, relative paths, & URL imports (`https:`, `//host`) are not packages.
 */
export function cssImportedPackages(css: string): string[] {
  const code = css.replaceAll(/\/\*[\s\S]*?\*\//gu, "");
  const names = new Set<string>();
  for (const match of code.matchAll(
    /@import\s+["'](?![a-z][a-z0-9+.-]*:)(@[^/"'\s]+\/[^/"'\s]+|[^@./"'\s][^/"'\s]*)/giu,
  )) {
    names.add(match[1] ?? "");
  }
  return [...names].sort(compareText);
}

/**
 * The first fenced code block under a Markdown heading, which is how `THIRD-PARTY-NOTICES.md` holds
 * a license text. Throws when the heading or its block is missing, so a reworded notice fails the
 * build instead of silently shipping without the text.
 */
export function noticeBlock(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n${heading}\n`);
  const fence = start === -1 ? -1 : markdown.indexOf("```\n", start);
  const end = fence === -1 ? -1 : markdown.indexOf("\n```", fence + 4);
  if (end === -1) throw new Error(`No fenced license text under "${heading}".`);
  return markdown.slice(fence + 4, end).trim();
}

/** Code copied into the project (not installed from npm) that carries its own license. */
export interface VendoredSource {
  declared: string;
  /** Resolved when the bundle is generated, so a missing source fails the build, not the config. */
  licenseText: () => string;
  name: string;
  /** Project-relative directory (with a trailing `/`) holding the copied code. */
  prefix: string;
}

export interface LicensesPluginOptions {
  allowlist?: Readonly<Record<string, string>>;
  /**
   * Project directories whose generated code comes from an installed package, keyed by prefix (for
   * example Paraglide's compiled runtime). A bundled module under a prefix counts that package.
   */
  generatedFrom?: Readonly<Record<string, string>>;
  /** Stylesheets (relative to the project root) whose bare `@import`s ship in the bundle. */
  stylesheets?: readonly string[];
  /** Copied code, listed when at least one of its modules rendered into the bundle. */
  vendored?: readonly VendoredSource[];
}

/**
 * Publishes `licenses.txt` with the client bundle & fails the build when a bundled package ships
 * no license text. "Bundled" means:
 *
 * - a package with at least one module that rendered code into a client chunk;
 * - a package a listed stylesheet `@import`s;
 * - a package behind generated project code (`generatedFrom`), or copied code (`vendored`), whose
 *   modules live in the project rather than `node_modules`.
 *
 * Known limits: CSS a JavaScript module imports (`import "pkg/style.css"`) is not a rendered module,
 * so list its stylesheet or package here if one appears. Only the client environment is scanned;
 * the service worker bundle imports nothing from `node_modules` today, & the server bundle is never
 * sent to players.
 */
export function licensesPlugin({
  allowlist = LICENSE_ALLOWLIST,
  generatedFrom = {},
  stylesheets = [],
  vendored = [],
}: LicensesPluginOptions = {}): Plugin {
  let projectRoot = process.cwd();
  return {
    apply: "build",
    configResolved(config) {
      projectRoot = config.root;
    },
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      const posixRoot = projectRoot.replaceAll("\\", "/");
      const roots = new Set<string>();
      const copied = new Set<VendoredSource>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const [id, rendered] of Object.entries(output.modules)) {
          if (rendered.renderedLength === 0) continue;
          const root = packageRootOf(id);
          if (root !== undefined) {
            roots.add(root);
            continue;
          }
          const projectPath = path.posix.relative(posixRoot, cleanModuleId(id));
          for (const source of vendored) {
            if (projectPath.startsWith(source.prefix)) copied.add(source);
          }
          for (const [prefix, name] of Object.entries(generatedFrom)) {
            if (projectPath.startsWith(prefix)) roots.add(installedRoot(name));
          }
        }
      }
      for (const stylesheet of stylesheets) {
        const css = readFileSync(path.resolve(projectRoot, stylesheet), "utf8");
        for (const name of cssImportedPackages(css)) roots.add(installedRoot(name));
      }
      const entries = uniqueEntries([
        ...[...roots].map((root) => readLicenseEntry(root)),
        ...[...copied].map(
          (source): LicenseEntry => ({
            declared: source.declared,
            name: source.name,
            texts: [source.licenseText()],
            version: "",
          }),
        ),
      ]);
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

  function installedRoot(name: string): string {
    return realpathSync(path.join(projectRoot, "node_modules", name));
  }
}
