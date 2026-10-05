import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { headersFilePlugin } from "../build/headers-file.js";
import { CSP_DIRECTIVES, cspDirectives } from "./csp-directives.js";
import {
  renderHeadersFile,
  SECURITY_HEADERS,
  serializeCsp,
  withSecurityHeaders,
} from "./security-headers.js";

import type { Plugin } from "vite";

const appHtml = readFileSync(path.resolve(import.meta.dirname, "../../app.html"), "utf8");

/**
 * The full production policy, pinned so any change to it is deliberate and visible in review.
 * Directive order is irrelevant to browsers; it follows `cspDirectives()`.
 */
const PRODUCTION_CSP = [
  "base-uri 'self'",
  "connect-src 'self' https://challenges.cloudflare.com",
  "default-src 'none'",
  "font-src 'self' https://assets.mistria.fyi",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src https://challenges.cloudflare.com",
  "img-src 'self' data: blob: https://assets.mistria.fyi",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ");

describe("Content-Security-Policy", () => {
  it("serializes the production policy", () => {
    expect(serializeCsp(CSP_DIRECTIVES)).toBe(PRODUCTION_CSP);
  });

  it("allows an overridden sprite origin for images only", () => {
    const directives = cspDirectives("http://localhost:8080/assets");
    expect(directives["img-src"]).toEqual(["self", "data:", "blob:", "http://localhost:8080"]);
    expect(directives["font-src"]).toEqual(CSP_DIRECTIVES["font-src"]);
  });

  it("quotes nonces and hashes like SvelteKit does", () => {
    expect(serializeCsp({ "script-src": ["self", "nonce-abc", "sha256-xyz"] })).toBe(
      "script-src 'self' 'nonce-abc' 'sha256-xyz'",
    );
  });

  it("gives inline scripts in app.html the SvelteKit nonce placeholder", () => {
    const scripts = [...appHtml.matchAll(/<script([^>]*)>/g)].map(([, attrs]) => attrs);
    const inlineScripts = scripts.filter((attrs) => !attrs.includes("src="));

    expect(inlineScripts.length).toBeGreaterThanOrEqual(2);
    for (const attrs of inlineScripts) {
      expect(attrs).toContain('nonce="%sveltekit.nonce%"');
    }
  });
});

describe("_headers", () => {
  it("applies the CSP and every security header to all routes", () => {
    expect(renderHeadersFile(CSP_DIRECTIVES).split("\n")).toEqual([
      "# Generated at build time from src/lib/security/. Do not edit; it is not committed.",
      "/*",
      `  Content-Security-Policy: ${PRODUCTION_CSP}`,
      "  Permissions-Policy: camera=(self), geolocation=(), microphone=(), payment=(), usb=()",
      "  Referrer-Policy: strict-origin-when-cross-origin",
      "  Strict-Transport-Security: max-age=31536000; includeSubDomains",
      "  X-Content-Type-Options: nosniff",
      "",
    ]);
  });

  describe("headersFilePlugin", () => {
    let directory: string | undefined;

    afterEach(() => {
      if (directory !== undefined) rmSync(directory, { force: true, recursive: true });
    });

    it("writes the file for production builds only", () => {
      directory = mkdtempSync(path.join(tmpdir(), "headers-file-"));
      const plugin: Plugin = headersFilePlugin("contents", directory);
      expect(plugin.apply).toBe("build");

      const { buildStart } = plugin;
      if (typeof buildStart !== "function") throw new Error("buildStart is not a function");
      Reflect.apply(buildStart, {}, [{}]);

      expect(readFileSync(path.join(directory, "_headers"), "utf8")).toBe("contents");
    });
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
