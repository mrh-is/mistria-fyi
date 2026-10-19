import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

import { toPosixPath } from "../../../scripts/lib/paths.js";
import { compareStrings } from "../ordering.js";

/** A dotted fiddle path that one pipeline module names in its source. */
export interface PipelineReference {
  module: string;
  reference: string;
}

/** How a module reaches a fiddle root: by naming it or a path inside it, or through an ancestor. */
export type ClaimVia = "ancestor" | "path";

/** A pipeline module whose source names a fiddle root, a path inside it, or an ancestor of it. */
export interface PipelineClaim {
  module: string;
  reference: string;
  via: ClaimVia;
}

const DOTTED_PATH = /^[a-z_][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;
const PATH_SEGMENTS = /^[a-z_][a-z0-9_]*(?:\.[a-z0-9_]+)*$/;
const TEMPLATE_HEAD = /^([a-z_][a-z0-9_]*(?:\.[a-z0-9_]+)*)\.$/;
// A dotted literal ending in one of these names a file (`"player_assets.toml"`), not a fiddle path.
const FILE_EXTENSIONS = new Set([
  "cjs",
  "csv",
  "exe",
  "gml",
  "html",
  "js",
  "json",
  "md",
  "mjs",
  "png",
  "sav",
  "svg",
  "tmx",
  "toml",
  "ts",
  "tsx",
  "tx",
  "txt",
  "webp",
  "yaml",
  "yml",
  "zip",
]);

/**
 * Extracts candidate dotted fiddle paths from one module's syntax tree, so comments & the text of
 * messages never count. It finds access chains on a `fiddle` value (`fiddle.dungeons?.misc`), a
 * string passed right after a `fiddle` argument (`nestedTableKeys(fiddle, "object_prototypes")`),
 * whole dotted string literals (`"ui.skill_menu.defaults"`), & template prefixes
 * (`` `quests.${type}` ``).
 */
export function referencesInSource(source: string): string[] {
  const file = ts.createSourceFile("module.ts", source, ts.ScriptTarget.Latest, true);
  const references = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    const path = fiddlePath(node);
    // Only the outermost access of a chain: `fiddle.dungeons.misc`, not also `fiddle.dungeons`.
    if (path !== undefined && fiddlePath(node.parent) === undefined) references.add(path);
    if (ts.isCallExpression(node)) {
      for (const [index, argument] of node.arguments.entries()) {
        const next = node.arguments.at(index + 1);
        if (!isFiddle(argument) || next === undefined) continue;
        const named = literalPath(next, PATH_SEGMENTS);
        if (named !== undefined) references.add(named);
      }
    }
    const literal = literalPath(node, DOTTED_PATH);
    if (literal !== undefined) references.add(literal);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...references].toSorted(compareStrings);
}

/** The dotted path an access chain on a `fiddle` value reaches, or undefined. */
function fiddlePath(node: ts.Node | undefined): string | undefined {
  if (node === undefined) return undefined;
  let name: string | undefined;
  if (ts.isPropertyAccessExpression(node)) {
    name = node.name.text;
  } else if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression)) {
    name = node.argumentExpression.text;
  } else {
    return undefined;
  }
  if (isFiddle(node.expression)) return name;
  const base = fiddlePath(node.expression);
  return base === undefined ? undefined : `${base}.${name}`;
}

/** `fiddle` itself, or a property named `fiddle` (`context.fiddle`). */
function isFiddle(node: ts.Node): boolean {
  return (
    (ts.isIdentifier(node) && node.text === "fiddle") ||
    (ts.isPropertyAccessExpression(node) && node.name.text === "fiddle")
  );
}

/** A string literal's dotted path, or a template's literal prefix, when it looks like one. */
function literalPath(node: ts.Node, pattern: RegExp): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    const extension = node.text.slice(node.text.lastIndexOf(".") + 1);
    if (!pattern.test(node.text) || FILE_EXTENSIONS.has(extension)) return undefined;
    return node.text;
  }
  if (ts.isTemplateExpression(node)) return TEMPLATE_HEAD.exec(node.head.text)?.[1];
  return undefined;
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
 * Lists the modules that claim a fiddle root, with how each reaches it: `path` when the reference
 * is the root or a path inside it, `ancestor` when it names an ancestor (`fiddle.items` for
 * `items.fish.river`). An ancestor claim means the module holds the parent table; it may read every
 * child or only some.
 */
export function claimsFor(
  rootPath: string,
  references: readonly PipelineReference[],
): PipelineClaim[] {
  const claims = new Map<string, PipelineClaim>();
  for (const { module, reference } of references) {
    let via: ClaimVia;
    if (reference === rootPath || isAncestor(rootPath, reference)) {
      via = "path";
    } else if (isAncestor(reference, rootPath)) {
      via = "ancestor";
    } else {
      continue;
    }
    claims.set(`${module}\n${reference}`, { module, reference, via });
  }
  return [...claims.values()].toSorted(
    (a, b) => compareStrings(a.module, b.module) || compareStrings(a.reference, b.reference),
  );
}

function isAncestor(ancestor: string, descendant: string): boolean {
  return descendant.startsWith(`${ancestor}.`);
}
