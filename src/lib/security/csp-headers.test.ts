import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const headersPath = resolve(import.meta.dirname, "../../../_headers");
const headersContent = readFileSync(headersPath, "utf-8");

describe("Content-Security-Policy headers", () => {
  it("_headers file exists and targets all routes", () => {
    expect(headersContent).toContain("/*");
  });

  it("includes Content-Security-Policy header", () => {
    expect(headersContent).toContain("Content-Security-Policy:");
  });

  const requiredDirectives = [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://challenges.cloudflare.com",
    "frame-src https://challenges.cloudflare.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
  ];

  for (const directive of requiredDirectives) {
    it(`includes directive: ${directive}`, () => {
      expect(headersContent).toContain(directive);
    });
  }
});
