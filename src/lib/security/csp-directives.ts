import type { Config } from "@sveltejs/kit/vite";

/**
 * The Content-Security-Policy SvelteKit emits for rendered pages. `vite.config.ts` passes it to the
 * `sveltekit()` plugin, and `csp-headers.test.ts` keeps the static `_headers` policy in step.
 */
export const CSP_DIRECTIVES = {
  "base-uri": ["self"],
  "connect-src": ["self", "https://challenges.cloudflare.com"],
  "default-src": ["none"],
  "font-src": ["self", "https://assets.mistria.fyi"],
  "form-action": ["self"],
  "frame-ancestors": ["none"],
  "frame-src": ["https://challenges.cloudflare.com"],
  "img-src": ["self", "data:", "blob:", "https://assets.mistria.fyi"],
  "manifest-src": ["self"],
  "object-src": ["none"],
  "script-src": ["self", "https://challenges.cloudflare.com"],
  "style-src": ["self", "unsafe-inline"],
  "worker-src": ["self", "blob:"],
} satisfies NonNullable<NonNullable<Config["csp"]>["directives"]>;
