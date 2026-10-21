// Verifies the production build's Cloudflare `_routes.json` keeps every static asset out of
// Functions routing. Cloudflare Pages caps the file at 100 rules, and the adapter silently drops
// any excess (#312). This check walks the build output and proves no asset (including the ones
// alphabetically past where a truncated list would stop) falls under an include rule without a
// matching exclude.
import "#scripts/lib/require-pinned-node";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { toPosixPath } from "#scripts/lib/paths";

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
  /**
   * URL paths of `.html` static assets that Functions would answer at their served path. Pages
   * redirects `/x.html` to `/x`, which the Function then redirects to a locale, so the file is
   * unreachable at its own path & the service worker's precache of it fails the whole install
   * (#226). Prerendered pages & bare-path stubs pass, since `_routes.json` includes only `/api/*`.
   */
  htmlAssets: string[];
  ruleCount: number;
  /** URL paths of static assets that would invoke the Function. */
  unexcludedAssets: string[];
}

/** The path Pages serves an asset at: `/en/data.html` at `/en/data`, `/a/index.html` at `/a`. */
export function servedPath(asset: string): string {
  if (!asset.endsWith(".html")) return asset;
  const directory = path.posix.dirname(asset);
  const name = path.posix.basename(asset, ".html");
  return name === "index" ? directory : path.posix.join(directory, name);
}

interface RoutesJson {
  exclude: string[];
  include: string[];
  version: number;
}

export async function checkRoutes(buildDir = BUILD_DIR): Promise<RoutesReport> {
  const raw = await readFile(path.join(buildDir, "_routes.json"), "utf8");
  const routes = JSON.parse(raw) as RoutesJson;
  const assets = await listStaticAssets(buildDir);
  return {
    htmlAssets: assets.filter(
      (asset) => asset.endsWith(".html") && isFunctionRoute(routes, servedPath(asset)),
    ),
    ruleCount: routes.include.length + routes.exclude.length,
    unexcludedAssets: assets.filter((asset) => isFunctionRoute(routes, servedPath(asset))),
  };
}

export function isFunctionRoute(
  routes: Pick<RoutesJson, "exclude" | "include">,
  urlPath: string,
): boolean {
  const included = routes.include.some((pattern) => matchesRoute(pattern, urlPath));
  const excluded = routes.exclude.some((pattern) => matchesRoute(pattern, urlPath));
  return included && !excluded;
}

/**
 * Cloudflare route patterns support a single `*` splat that matches any character sequence,
 * including `/`, so `/sprites/*` covers the whole directory tree.
 */
export function matchesRoute(pattern: string, urlPath: string): boolean {
  const source = pattern
    .split("*")
    .map((part) => escapeRegExp(part))
    .join(".*");
  return new RegExp(`^${source}$`).test(urlPath);
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

async function listStaticAssets(buildDir: string): Promise<string[]> {
  const entries = await readdir(buildDir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(buildDir, path.join(entry.parentPath, entry.name)))
    .filter((relative) => !PAGES_INTERNAL_FILES.has(relative))
    .map((relative) => `/${toPosixPath(relative)}`)
    .toSorted();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { htmlAssets, ruleCount, unexcludedAssets } = await checkRoutes();
  let failed = false;
  if (htmlAssets.length > 0) {
    console.error(
      `Cloudflare Pages redirects .html assets away from their own path, so these can't be served:`,
    );
    for (const asset of htmlAssets) {
      console.error(`  ${asset}`);
    }
    failed = true;
  }
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
    process.exitCode = 1;
  } else {
    console.log(
      `_routes.json uses ${ruleCount} rules; every static asset bypasses Functions & every .html asset is reachable.`,
    );
  }
}
