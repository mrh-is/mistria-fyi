// Verifies the production build's Cloudflare `_routes.json` keeps every static asset out of
// Functions routing. Cloudflare Pages caps the file at 100 rules, and the adapter silently drops
// any excess, so a per-file exclusion list overflows once `static/sprites/` is counted. This
// check walks the build output and proves every asset (including the ones alphabetically past
// where a truncated list would stop) matches an exclude rule. See #312.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const BUILD_DIR = path.join(import.meta.dirname, "..", "build");

/** Cloudflare Pages' documented `_routes.json` rule limit (include + exclude). */
export const ROUTE_RULE_LIMIT = 100;

/** Pages-internal files in the build output that are not served as static assets. */
const PAGES_INTERNAL_FILES = new Set([
  "404.html",
  ".assetsignore",
  "_headers",
  "_redirects",
  "_routes.json",
  "_worker.js",
]);

export interface RoutesReport {
  ruleCount: number;
  /** URL paths of static assets that would invoke the Function. */
  unexcludedAssets: string[];
}

interface RoutesJson {
  exclude: string[];
  include: string[];
  version: number;
}

export async function checkRoutes(buildDir = BUILD_DIR): Promise<RoutesReport> {
  const raw = await readFile(path.join(buildDir, "_routes.json"), "utf-8");
  const routes = JSON.parse(raw) as RoutesJson;
  const assets = await listStaticAssets(buildDir);
  return {
    ruleCount: routes.include.length + routes.exclude.length,
    unexcludedAssets: assets.filter((asset) => isFunctionRoute(routes, asset)),
  };
}

export function isFunctionRoute(routes: Pick<RoutesJson, "exclude" | "include">, urlPath: string) {
  const included = routes.include.some((pattern) => matchesRoute(pattern, urlPath));
  const excluded = routes.exclude.some((pattern) => matchesRoute(pattern, urlPath));
  return included && !excluded;
}

/**
 * Cloudflare route patterns support a single `*` splat that matches any character sequence,
 * including `/`, so `/sprites/*` covers the whole directory tree.
 */
export function matchesRoute(pattern: string, urlPath: string): boolean {
  const source = pattern.split("*").map(escapeRegExp).join(".*");
  return new RegExp(`^${source}$`).test(urlPath);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function listStaticAssets(buildDir: string): Promise<string[]> {
  const entries = await readdir(buildDir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(buildDir, path.join(entry.parentPath, entry.name)))
    .filter((relative) => !PAGES_INTERNAL_FILES.has(relative))
    .map((relative) => `/${relative.split(path.sep).join("/")}`)
    .sort();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ruleCount, unexcludedAssets } = await checkRoutes();
  let failed = false;
  if (ruleCount > ROUTE_RULE_LIMIT) {
    console.error(
      `_routes.json has ${ruleCount} rules; Cloudflare Pages caps it at ${ROUTE_RULE_LIMIT}.`,
    );
    failed = true;
  }
  if (unexcludedAssets.length > 0) {
    console.error(
      `${unexcludedAssets.length} static asset(s) would invoke the Function instead of bypassing it:`,
    );
    for (const asset of unexcludedAssets.slice(0, 20)) {
      console.error(`  ${asset}`);
    }
    if (unexcludedAssets.length > 20) {
      console.error(`  … and ${unexcludedAssets.length - 20} more`);
    }
    failed = true;
  }
  if (failed) {
    process.exit(1);
  }
  console.log(`_routes.json uses ${ruleCount} rules; every static asset bypasses Functions.`);
}
