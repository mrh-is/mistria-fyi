import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CSP_DIRECTIVES, cspDirectives } from "./csp-directives.js";
import { APP_HTML_SCRIPT_HASHES, inlineScriptHashes } from "./inline-scripts.js";
import { SECURITY_HEADERS, serializeCsp, withSecurityHeaders } from "./security-headers.js";

const appHtml = readFileSync(path.resolve(import.meta.dirname, "../../app.html"), "utf8");

/**
 * The full production policy, pinned so any change to it is deliberate and visible in review.
 * Directive order is irrelevant to browsers; it follows `cspDirectives()`. The two hashes are
 * `app.html`'s inline scripts; editing either script changes its hash here.
 */
const PRODUCTION_CSP = [
  "base-uri 'self'",
  "connect-src 'self' https://challenges.cloudflare.com https://assets.mistria.fyi https://relay.mistria.fyi wss://relay.mistria.fyi",
  "default-src 'none'",
  "font-src 'self' https://assets.mistria.fyi",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src https://challenges.cloudflare.com",
  "img-src 'self' data: blob: https://assets.mistria.fyi",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self' 'sha256-XIQPz/EHVHtaNDpPlKdP9QmbA8sA6JI+HC1FdpuSf5U=' 'sha256-skEiY6WdeTf4zpIoOxmWHD8LMMXXVPqpMaKmtDlLHHI=' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ");

describe("Content-Security-Policy", () => {
  it("serializes the production policy", () => {
    expect(serializeCsp(CSP_DIRECTIVES)).toBe(PRODUCTION_CSP);
  });

  it("allows an overridden sprite origin for images & the service worker's fetches", () => {
    const directives = cspDirectives("http://localhost:8080/assets");
    expect(directives["img-src"]).toEqual(["self", "data:", "blob:", "http://localhost:8080"]);
    expect(directives["font-src"]).toEqual(CSP_DIRECTIVES["font-src"]);
    expect(directives["connect-src"]).toEqual([
      "self",
      "https://challenges.cloudflare.com",
      "https://assets.mistria.fyi",
      "https://relay.mistria.fyi",
      "wss://relay.mistria.fyi",
      "http://localhost:8080",
    ]);
  });

  // The service worker fetches fonts & sprites with `fetch()`, which `connect-src` governs, not
  // `font-src` or `img-src`. A gap here breaks those assets on every controlled page (#226).
  it("lets the service worker fetch every font & image origin", () => {
    const connect = new Set(CSP_DIRECTIVES["connect-src"]);
    const remote = [
      ...(CSP_DIRECTIVES["font-src"] ?? []),
      ...(CSP_DIRECTIVES["img-src"] ?? []),
    ].filter((source) => source.startsWith("http"));
    expect(remote.length).toBeGreaterThan(0);
    for (const source of remote) expect(connect).toContain(source);
  });

  it("quotes nonces and hashes like SvelteKit does", () => {
    expect(serializeCsp({ "script-src": ["self", "nonce-abc", "sha256-xyz"] })).toBe(
      "script-src 'self' 'nonce-abc' 'sha256-xyz'",
    );
  });

  // SvelteKit refuses to prerender a template containing `%sveltekit.nonce%`, and a nonce baked
  // into static HTML would be no secret anyway, so app.html's scripts are allowed by hash.
  it("allows every inline script in app.html by hash, not by nonce", () => {
    expect(appHtml).not.toContain("%sveltekit.nonce%");
    expect(APP_HTML_SCRIPT_HASHES).toHaveLength(2);
    expect(inlineScriptHashes(appHtml)).toEqual(APP_HTML_SCRIPT_HASHES);
    for (const hash of APP_HTML_SCRIPT_HASHES) {
      expect(CSP_DIRECTIVES["script-src"]).toContain(hash);
    }
  });
});

describe("inlineScriptHashes", () => {
  it("hashes the exact text of each executable inline script", () => {
    // `echo -n 'alert(1)' | openssl dgst -sha256 -binary | base64`
    expect(inlineScriptHashes("<script>alert(1)</script>")).toEqual([
      "sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI=",
    ]);
    expect(inlineScriptHashes('<script type="module">alert(1)</script>')).toEqual([
      "sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI=",
    ]);
  });

  // `printf 'alert(1)' | openssl dgst -sha256 -binary | base64`
  const ALERT_HASH = "sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI=";

  it.each([
    ["whitespace & attributes", "<script>alert(1)</script\t\n bar>"],
    ["a space", "<script>alert(1)</script >"],
    ["a solidus", "<script>alert(1)</script/>"],
    ["upper case", "<script>alert(1)</SCRIPT>"],
    ["mixed case & attributes", "<script>alert(1)</ScRiPt\fx=y>"],
  ])("ends a script at an end tag with %s, as the HTML tokenizer does", (_, html) => {
    expect(inlineScriptHashes(html)).toEqual([ALERT_HASH]);
  });

  // The script's text runs on to the real end tag, so the hash covers all of it:
  // `printf '<text>' | openssl dgst -sha256 -binary | base64`.
  it.each([
    [
      '<script>console.log("</script-not>")</script>',
      "sha256-U0t4ekmO8ncEzU0qcwDaJRX48PqoT/AumXMk2YKnyDg=",
    ],
    ["<script>alert(1)</scripts>x</script>", "sha256-Y3Ok4pGzPQXsXfZr+5cxkBF7/BnDL8KI7idwyorjrQA="],
  ])("doesn't end a script at a longer tag name: %s", (html, hash) => {
    expect(inlineScriptHashes(html)).toEqual([hash]);
  });

  it("reads a start tag whose quoted attribute values contain `>`", () => {
    expect(inlineScriptHashes('<script data-x="a>b">alert(1)</script>')).toEqual([ALERT_HASH]);
    expect(inlineScriptHashes("<script data-x='a>b'>alert(1)</script>")).toEqual([ALERT_HASH]);
    // The `type` after a `>`-bearing value is still read, so the data block stays unhashed.
    expect(inlineScriptHashes('<script data-x="a>b" type="application/json">{}</script>')).toEqual(
      [],
    );
  });

  it("reads attributes only outside quoted values", () => {
    expect(inlineScriptHashes('<script data-note="src=x">alert(1)</script>')).toEqual([ALERT_HASH]);
    expect(
      inlineScriptHashes('<script data-note="type=application/json">alert(1)</script>'),
    ).toEqual([ALERT_HASH]);
    expect(inlineScriptHashes('<script SRC="/a.js"></script>')).toEqual([]);
  });

  it("skips external scripts, inert data blocks, & duplicates", () => {
    const html = [
      '<script src="/_app/start.js"></script>',
      '<script type="application/json" data-sveltekit-fetched>{"a":1}</script>',
      "<script>x()</script>",
      "<script>x()</script>",
    ].join("");
    expect(inlineScriptHashes(html)).toHaveLength(1);
  });
});

describe("withSecurityHeaders", () => {
  it("adds every security header", () => {
    const response = withSecurityHeaders(new Response("ok"));
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(name)).toBe(value);
    }
  });

  it("keeps a header the response already set", () => {
    const response = withSecurityHeaders(
      new Response("ok", { headers: { "Referrer-Policy": "no-referrer" } }),
    );
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("copies a response whose headers are immutable", async () => {
    const response = withSecurityHeaders(Response.redirect("https://mistria-fyi.test/en", 307));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://mistria-fyi.test/en");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe("");
  });
});
