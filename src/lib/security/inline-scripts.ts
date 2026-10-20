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

// An end tag may carry whitespace & junk attributes (`</script foo>`), which still close the element.
const SCRIPT_ELEMENT = /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi;
const TYPE_ATTRIBUTE = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const SRC_ATTRIBUTE = /\bsrc\s*=/i;

function sha256Source(content: string): CspScriptHash {
  return `sha256-${createHash("sha256").update(content, "utf8").digest("base64")}`;
}

/**
 * The CSP hash of every executable inline `<script>` in `html`, in document order and without
 * duplicates. A browser hashes the element's exact text, so the content is used byte for byte.
 * Build-time only: it reads trusted, generated markup, not arbitrary HTML.
 */
export function inlineScriptHashes(html: string): CspScriptHash[] {
  const hashes = new Set<CspScriptHash>();
  for (const [, attributes = "", content = ""] of html.matchAll(SCRIPT_ELEMENT)) {
    if (SRC_ATTRIBUTE.test(attributes)) continue;
    const typeMatch = TYPE_ATTRIBUTE.exec(attributes);
    const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? typeMatch?.[3] ?? "").trim().toLowerCase();
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
