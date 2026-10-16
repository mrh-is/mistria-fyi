import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { toPosixPath } from "../../../scripts/lib/paths.js";
import { compareStrings } from "../ordering.js";

/** A dotted fiddle path that one pipeline module names in its source. */
export interface PipelineReference {
  module: string;
  reference: string;
}

/** A pipeline module whose source names a fiddle root, an ancestor of it, or a path inside it. */
export interface PipelineClaim {
  module: string;
  reference: string;
}

// Comments cite files (`` `cutscenes.toml` ``) as provenance without reading them. The line
// pattern spares `://` in URLs; a `//` inside some other string only truncates that line.
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /(^|[^:])\/\/.*$/gm;
// `fiddle.items.tools` & `context.fiddle.items`, but not import specifiers like `./parse-fiddle.js`.
const MEMBER_CHAIN = /(?<![\w/-])fiddle((?:\.[A-Za-z_]\w*)+)/g;
// `nestedTableKeys(fiddle, "object_prototypes")`: a root named right after a fiddle argument.
const FIDDLE_ARGUMENT = /(?<![\w/-])fiddle\s*,\s*["'`]([a-z_][a-z0-9_]*(?:\.[a-z0-9_]+)*)["'`]/g;
// `"ui.skill_menu.defaults"`: dotted string literals, which name nested roots directly.
const DOTTED_LITERAL = /["'`]([a-z_][a-z0-9_]*(?:\.[a-z0-9_]+)+)["'`]/g;
// `` `quests.${type}` ``: the literal prefix of a template that builds a dotted path.
const TEMPLATE_PREFIX = /`([a-z_][a-z0-9_]*(?:\.[a-z0-9_]+)*)\.\$\{/g;

/** Extracts candidate dotted fiddle paths from one module's source text. */
export function referencesInSource(source: string): string[] {
  const code = source.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, "$1");
  const references = new Set<string>();
  for (const match of code.matchAll(MEMBER_CHAIN)) {
    references.add(match[1].slice(1));
  }
  for (const pattern of [FIDDLE_ARGUMENT, DOTTED_LITERAL, TEMPLATE_PREFIX]) {
    for (const match of code.matchAll(pattern)) {
      references.add(match[1]);
    }
  }
  return [...references].toSorted(compareStrings);
}

/**
 * Statically scans the pipeline's non-test TypeScript for dotted fiddle paths. This approximates
 * which modules read which roots; it cannot follow paths built from variables.
 */
export function scanPipelineReferences(srcDir: string): PipelineReference[] {
  const references: PipelineReference[] = [];
  const entries = readdirSync(srcDir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !isScannedModule(entry.name)) continue;
    const module = toPosixPath(relative(srcDir, join(entry.parentPath, entry.name)));
    if (module.startsWith("atlas/")) continue;
    const source = readFileSync(join(entry.parentPath, entry.name), "utf8");
    for (const reference of referencesInSource(source)) {
      references.push({ module, reference });
    }
  }
  return references.toSorted(
    (a, b) => compareStrings(a.module, b.module) || compareStrings(a.reference, b.reference),
  );
}

function isScannedModule(name: string): boolean {
  return (
    name.endsWith(".ts") &&
    !name.endsWith(".test.ts") &&
    !name.startsWith("test-helpers") &&
    name !== "assets-test-setup.ts"
  );
}

/**
 * Lists the modules that claim a fiddle root: a reference equal to the root or inside it, or an
 * ancestor of it. A module's ancestor reference is ignored when the same module also names a more
 * specific path under that ancestor, since it then only walks down to that path (as with
 * `fiddle.ui` followed by `"ui.skill_menu.defaults"`).
 */
export function claimsFor(
  rootPath: string,
  references: readonly PipelineReference[],
): PipelineClaim[] {
  const claims = new Map<string, PipelineClaim>();
  for (const { module, reference } of references) {
    if (!relates(rootPath, reference)) continue;
    if (isAncestor(reference, rootPath) && hasNarrowerReference(module, reference, references)) {
      continue;
    }
    const key = `${module}\n${reference}`;
    claims.set(key, { module, reference });
  }
  return [...claims.values()].toSorted(
    (a, b) => compareStrings(a.module, b.module) || compareStrings(a.reference, b.reference),
  );
}

function relates(rootPath: string, reference: string): boolean {
  return (
    reference === rootPath || isAncestor(rootPath, reference) || isAncestor(reference, rootPath)
  );
}

function isAncestor(ancestor: string, descendant: string): boolean {
  return descendant.startsWith(`${ancestor}.`);
}

function hasNarrowerReference(
  module: string,
  ancestor: string,
  references: readonly PipelineReference[],
): boolean {
  return references.some(
    (other) => other.module === module && isAncestor(ancestor, other.reference),
  );
}
