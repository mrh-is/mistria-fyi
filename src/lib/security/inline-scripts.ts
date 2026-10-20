import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/** A CSP hash source, unquoted, as SvelteKit's directive types spell it. */
export type CspScriptHash = `sha256-${string}`;

/**
 * Script types a browser executes, and so a CSP governs. Any other `type` (SvelteKit's
 * `application/json` fetch cache, for one) is inert data that needs no hash.
 */
const EXECUTABLE_SCRIPT_TYPES = new Set([
  "",
  "module",
  "text/javascript",
  "application/javascript",
]);

// Follows the HTML tokenizer: a start tag's quoted attribute values may contain `>`, and in the
// script's text, `</script` (any case) ends the element only when whitespace, `/`, or `>` follows
// it, whatever else that end tag holds (`</script foo>`); `</scripts>` & `</script-x>` don't.
const SCRIPT_ELEMENT =
  /<script(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script(?=[\s/>])[^>]*>/gi;
// One attribute: a name, then an optional double-quoted, single-quoted, or bare value.
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g;

function sha256Source(content: string): CspScriptHash {
  return `sha256-${createHash("sha256").update(content, "utf8").digest("base64")}`;
}

/**
 * A start tag's attributes by lowercase name. The first of duplicate names wins, as in the HTML
 * tokenizer, and text inside a quoted value (`data-x="src=y"`) is never read as a name.
 */
function parseAttributes(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const [, name = "", rawValue = ""] of source.matchAll(ATTRIBUTE)) {
    const key = name.toLowerCase();
    const quoted = rawValue.startsWith('"') || rawValue.startsWith("'");
    if (!attributes.has(key)) attributes.set(key, quoted ? rawValue.slice(1, -1) : rawValue);
  }
  return attributes;
}

/**
 * The CSP hash of every executable inline `<script>` in `html`, in document order and without
 * duplicates. A browser hashes the element's exact text, so the content is used byte for byte.
 * Build-time only: it reads trusted, generated markup, not arbitrary HTML.
 */
export function inlineScriptHashes(html: string): CspScriptHash[] {
  const hashes = new Set<CspScriptHash>();
  for (const [, attributeSource = "", content = ""] of html.matchAll(SCRIPT_ELEMENT)) {
    const attributes = parseAttributes(attributeSource);
    if (attributes.has("src")) continue;
    const type = (attributes.get("type") ?? "").trim().toLowerCase();
    if (!EXECUTABLE_SCRIPT_TYPES.has(type)) continue;
    hashes.add(sha256Source(content));
  }
  return [...hashes];
}

/**
 * The hashes of `src/app.html`'s inline scripts (the theme & `theme-color` bootstraps). They run
 * before SvelteKit's own script on every page, rendered or prerendered, so the policy allows them
 * by hash: SvelteKit forbids the `%sveltekit.nonce%` placeholder in a prerendered page's template.
 */
export const APP_HTML_SCRIPT_HASHES: readonly CspScriptHash[] = inlineScriptHashes(
  readFileSync(path.resolve(import.meta.dirname, "../../app.html"), "utf8"),
);
