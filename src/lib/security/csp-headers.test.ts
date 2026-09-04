import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { handle } from "../../hooks.server.js";
import { CONTENT_SECURITY_POLICY, CSP_DIRECTIVES } from "./csp.js";

import type { Handle } from "@sveltejs/kit";

const headersPath = resolve(import.meta.dirname, "../../../_headers");
const headersContent = readFileSync(headersPath, "utf-8");
const appHtmlPath = resolve(import.meta.dirname, "../../app.html");
const appHtmlContent = readFileSync(appHtmlPath, "utf-8");

describe("Content-Security-Policy headers", () => {
  it("_headers file exists and targets all routes", () => {
    expect(headersContent).toContain("/*");
  });

  it("includes Content-Security-Policy header", () => {
    expect(headersContent).toContain(`Content-Security-Policy: ${CONTENT_SECURITY_POLICY}`);
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
      expect(CSP_DIRECTIVES).toContain(directive);
    });
  }

  it("sets the CSP on the rendered document response", async () => {
    const event = {} as Parameters<Handle>[0]["event"];
    const response = await handle({
      event,
      resolve: () => Promise.resolve(new Response("<!doctype html><title>Rendered page</title>")),
    });

    expect(response.headers.get("Content-Security-Policy")).toBe(CONTENT_SECURITY_POLICY);
  });

  it("allows each fixed inline script by its exact SHA-256 hash", () => {
    const scripts = [...appHtmlContent.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
      ([, script]) => script,
    );

    expect(scripts).toHaveLength(2);
    for (const script of scripts) {
      const hash = createHash("sha256").update(script).digest("base64");
      expect(CONTENT_SECURITY_POLICY).toContain(`'sha256-${hash}'`);
    }
  });

  it("does not allow arbitrary inline scripts or obsolete Google Fonts origins", () => {
    expect(CONTENT_SECURITY_POLICY).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("fonts.googleapis.com");
    expect(CONTENT_SECURITY_POLICY).not.toContain("fonts.gstatic.com");
  });
});
