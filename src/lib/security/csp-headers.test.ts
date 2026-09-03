import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const headersPath = resolve(import.meta.dirname, "../../../_headers");
const headersContent = readFileSync(headersPath, "utf-8");
const appHtmlPath = resolve(import.meta.dirname, "../../app.html");
const appHtmlContent = readFileSync(appHtmlPath, "utf-8");

describe("Content-Security-Policy headers", () => {
  it("_headers file exists and targets all routes", () => {
    expect(headersContent).toContain("/*");
  });

  it("includes Content-Security-Policy header", () => {
    expect(headersContent).toContain("Content-Security-Policy:");
  });

  const requiredDirectives = [
    "default-src 'none'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
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

  it("allows each fixed inline script by its exact SHA-256 hash", () => {
    const scripts = [...appHtmlContent.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      ([, script]) => script,
    );

    expect(scripts).toHaveLength(2);
    for (const script of scripts) {
      const hash = createHash("sha256").update(script).digest("base64");
      expect(headersContent).toContain(`'sha256-${hash}'`);
    }
  });

  it("does not allow arbitrary inline scripts or obsolete Google Fonts origins", () => {
    expect(headersContent).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(headersContent).not.toContain("fonts.googleapis.com");
    expect(headersContent).not.toContain("fonts.gstatic.com");
  });
});
