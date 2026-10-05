import type { CspDirectives } from "./csp-directives.js";

/**
 * Response headers every route carries alongside the CSP. Cloudflare Pages applies `_headers` to
 * static files only, so `hooks.server.ts` adds the same set to server-rendered responses.
 *
 * - `Permissions-Policy` keeps the camera for the transfer QR scanner (same origin only) and turns
 *   off the other powerful features the app never uses.
 * - `Referrer-Policy` sends only the origin cross-origin; Turnstile checks the embedding hostname,
 *   so `no-referrer` would break the feedback form.
 * - `Strict-Transport-Security` omits `includeSubDomains` and `preload`: both bind every
 *   `mistria.fyi` subdomain to HTTPS, which is a domain-wide decision rather than this app's.
 */
export const SECURITY_HEADERS = {
  "Permissions-Policy": "camera=(self), geolocation=(), microphone=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
} as const;

/** CSP keywords that must be single-quoted, matching how SvelteKit serializes its own policy. */
const QUOTED_KEYWORDS = new Set([
  "none",
  "report-sample",
  "self",
  "strict-dynamic",
  "unsafe-eval",
  "unsafe-hashes",
  "unsafe-inline",
  "wasm-unsafe-eval",
]);

function serializeSource(source: string): string {
  return QUOTED_KEYWORDS.has(source) || /^(?:nonce|sha256|sha384|sha512)-/.test(source)
    ? `'${source}'`
    : source;
}

/** Serializes directives into a `Content-Security-Policy` header value. */
export function serializeCsp(directives: CspDirectives): string {
  return Object.entries(directives)
    .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
    .map(([name, sources]) => [name, ...sources.map((source) => serializeSource(source))].join(" "))
    .join("; ");
}

/**
 * Renders the Cloudflare Pages `_headers` file. The adapter appends its own `/_app/*` cache rules
 * to whatever this produces.
 */
export function renderHeadersFile(directives: CspDirectives): string {
  const headers: [string, string][] = [
    ["Content-Security-Policy", serializeCsp(directives)],
    ...Object.entries(SECURITY_HEADERS),
  ];
  return [
    "# Generated at build time from src/lib/security/. Do not edit; it is not committed.",
    "/*",
    ...headers.map(([name, value]) => `  ${name}: ${value}`),
    "",
  ].join("\n");
}

/**
 * Adds any security header the response doesn't already set. Some responses (`Response.redirect`,
 * a proxied `fetch`) have immutable headers; those are copied into a mutable response first.
 */
export function withSecurityHeaders(response: Response): Response {
  const missing = Object.entries(SECURITY_HEADERS).filter(([name]) => !response.headers.has(name));
  if (missing.length === 0) {
    return response;
  }
  let target = response;
  try {
    for (const [name, value] of missing) {
      target.headers.set(name, value);
    }
  } catch {
    target = new Response(response.body, response);
    for (const [name, value] of missing) {
      target.headers.set(name, value);
    }
  }
  return target;
}
