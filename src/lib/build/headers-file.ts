import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { inlineScriptHashes } from "../security/inline-scripts.js";
import { SECURITY_HEADERS, serializeCsp } from "../security/security-headers.js";
import { LOCALE_CODES } from "../types/locale.js";

import type { Adapter, Builder } from "@sveltejs/kit";

import type { CspDirectives } from "../security/csp-directives.js";

/** A prerendered page: its URL path & the HTML SvelteKit wrote for it. */
export interface PrerenderedPage {
  html: string;
  path: string;
}

/** Cloudflare Pages' documented `_headers` caps: rules per file & characters per line. */
export const HEADERS_RULE_LIMIT = 100;
export const HEADERS_LINE_LIMIT = 2000;

/** Rules `@sveltejs/adapter-cloudflare` appends after ours (`/_app/*` & `/_app/immutable/*`). */
const ADAPTER_HEADER_RULES = 2;

const LOCALE_SET: ReadonlySet<string> = new Set(LOCALE_CODES);
const LOCALIZED_PATH = /^\/([^/]+)(\/.+)$/;

/**
 * The `_headers` pattern covering `pagePath` and its other locales' copies: `/en/data` becomes
 * `/:locale/data`, so one rule serves a route in every locale and the file stays well under its
 * rule cap. A locale's home (`/en`) keeps its literal path, since `/:locale` would also match
 * every top-level static file.
 */
function routePattern(pagePath: string): string {
  const match = LOCALIZED_PATH.exec(pagePath);
  return match?.[1] !== undefined && LOCALE_SET.has(match[1]) ? `/:locale${match[2]}` : pagePath;
}

/**
 * A rule per prerendered route, replacing the `/*` rule's CSP with one that also allows the
 * route's inline scripts by hash. A prerendered page carries SvelteKit's start script inline, and
 * the `/*` policy (no nonce, no hash for it) would block it: a browser enforces every policy it
 * receives, `<meta>` & header alike. The header keeps `frame-ancestors`, which a `<meta>` policy
 * can't express. `! Content-Security-Policy` detaches the inherited value; without it, Pages
 * would join both values with a comma, which browsers read as two policies. The adapter's own
 * `/_app/immutable/*` rule detaches & resets `Cache-Control` the same way.
 */
function prerenderedCspRules(
  directives: CspDirectives,
  pages: readonly PrerenderedPage[],
): string[] {
  const hashesByPattern = new Map<string, Set<string>>();
  for (const page of pages) {
    const pattern = routePattern(page.path);
    const hashes = hashesByPattern.get(pattern) ?? new Set();
    for (const hash of inlineScriptHashes(page.html)) hashes.add(hash);
    hashesByPattern.set(pattern, hashes);
  }
  const scriptSrc = directives["script-src"] ?? [];
  return [...hashesByPattern]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .flatMap(([pattern, hashes]) => {
      const policy = serializeCsp({
        ...directives,
        "script-src": [...new Set([...scriptSrc, ...hashes])] as typeof scriptSrc,
      });
      return ["", pattern, "  ! Content-Security-Policy", `  Content-Security-Policy: ${policy}`];
    });
}

/**
 * Renders the Cloudflare Pages `_headers` file: the CSP & every security header on `/*`, and a
 * script-hash CSP for each prerendered route. The adapter appends its own `/_app/*` cache rules
 * to whatever this produces. Throws rather than emit a file Pages would reject or truncate.
 */
export function renderHeadersFile(
  directives: CspDirectives,
  prerenderedPages: readonly PrerenderedPage[] = [],
): string {
  const headers: [string, string][] = [
    ["Content-Security-Policy", serializeCsp(directives)],
    ...Object.entries(SECURITY_HEADERS),
  ];
  const lines = [
    "# Generated at build time from src/lib/security/. Do not edit; it is not committed.",
    "/*",
    ...headers.map(([name, value]) => `  ${name}: ${value}`),
    ...prerenderedCspRules(directives, prerenderedPages),
    "",
  ];
  const tooLong = lines.find((line) => line.length > HEADERS_LINE_LIMIT);
  if (tooLong !== undefined) {
    throw new Error(
      `A _headers line is ${tooLong.length} characters; Pages caps lines at ${HEADERS_LINE_LIMIT}.`,
    );
  }
  const ruleCount = lines.filter((line) => line.startsWith("/")).length + ADAPTER_HEADER_RULES;
  if (ruleCount > HEADERS_RULE_LIMIT) {
    throw new Error(`_headers has ${ruleCount} rules; Pages caps it at ${HEADERS_RULE_LIMIT}.`);
  }
  return lines.join("\n");
}

/** Every page SvelteKit prerendered, read through the builder's public API. */
function readPrerenderedPages(builder: Builder): PrerenderedPage[] {
  const scratch = mkdtempSync(path.join(tmpdir(), "mfg-prerendered-"));
  try {
    builder.writePrerendered(scratch);
    return [...builder.prerendered.pages].map(([pagePath, { file }]) => ({
      html: readFileSync(path.join(scratch, file), "utf8"),
      path: pagePath,
    }));
  } finally {
    rmSync(scratch, { force: true, recursive: true });
  }
}

/**
 * Wraps `adapter` so the Cloudflare Pages `_headers` file is written just before it adapts the
 * build. `@sveltejs/adapter-cloudflare` reads `_headers` from the working directory then, after
 * prerendering, so the prerendered pages' script hashes are known. Generating it here keeps the
 * static-file CSP and the rendered-page CSP one source; the file is gitignored so a hand edit
 * can't drift from it.
 */
export function withHeadersFile(
  adapter: Adapter,
  directives: CspDirectives,
  directory = process.cwd(),
): Adapter {
  return {
    ...adapter,
    async adapt(builder) {
      const content = renderHeadersFile(directives, readPrerenderedPages(builder));
      writeFileSync(path.join(directory, "_headers"), content);
      await adapter.adapt(builder);
    },
  };
}
