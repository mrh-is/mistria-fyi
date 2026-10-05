import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { CSP_DIRECTIVES } from "./csp-directives.js";

const headersPath = resolve(import.meta.dirname, "../../../_headers");
const headersContent = readFileSync(headersPath, "utf8");
const appHtmlPath = resolve(import.meta.dirname, "../../app.html");
const appHtmlContent = readFileSync(appHtmlPath, "utf8");

function parseHeadersCsp(content: string): Map<string, string> {
  const cspMatch = /Content-Security-Policy:\s*(.+)/.exec(content);
  if (!cspMatch) {
    throw new Error("No CSP header found in _headers file");
  }
  const parsed = new Map<string, string>();
  for (const directive of cspMatch[1].split(";")) {
    const trimmed = directive.trim();
    const spaceIdx = trimmed.indexOf(" ");
    if (spaceIdx === -1) {
      parsed.set(trimmed, "");
    } else {
      parsed.set(trimmed.slice(0, spaceIdx), trimmed.slice(spaceIdx + 1));
    }
  }
  return parsed;
}

const requiredDirectiveNames = [
  "default-src",
  "script-src",
  "style-src",
  "font-src",
  "img-src",
  "connect-src",
  "frame-src",
  "frame-ancestors",
  "form-action",
  "base-uri",
  "manifest-src",
  "worker-src",
  "object-src",
];

describe("Content-Security-Policy", () => {
  it("CSP_DIRECTIVES defines CSP directives", () => {
    const directives: Record<string, readonly string[]> = CSP_DIRECTIVES;
    expect(directives["default-src"]).toContain("none");
    expect(directives["script-src"]).toContain("self");
    expect(directives["object-src"]).toContain("none");
  });

  it("_headers file exists and targets all routes", () => {
    expect(headersContent).toContain("/*");
    expect(headersContent).toContain("Content-Security-Policy:");
  });

  it("CSP_DIRECTIVES covers all required directives", () => {
    const directives: Record<string, readonly string[]> = CSP_DIRECTIVES;
    for (const name of requiredDirectiveNames) {
      expect(directives, `missing directive: ${name}`).toHaveProperty(name);
    }
  });

  it("_headers covers all required directives", () => {
    const parsed = parseHeadersCsp(headersContent);
    for (const name of requiredDirectiveNames) {
      expect(parsed.has(name), `_headers missing directive: ${name}`).toBe(true);
    }
  });

  it("CSP_DIRECTIVES and _headers share the same directive values", () => {
    const directives: Record<string, readonly string[]> = CSP_DIRECTIVES;
    const headersParsed = parseHeadersCsp(headersContent);

    for (const name of requiredDirectiveNames) {
      const configValues = directives[name] ?? [];
      const headersValue = headersParsed.get(name) ?? "";

      for (const value of configValues) {
        expect(headersValue).toContain(value);
      }
    }
  });

  it("inline scripts in app.html use the SvelteKit nonce placeholder", () => {
    const scripts = [...appHtmlContent.matchAll(/<script([^>]*)>/g)].map(([, attrs]) => attrs);
    const inlineScripts = scripts.filter((attrs) => !attrs.includes("src="));

    expect(inlineScripts.length).toBeGreaterThanOrEqual(2);
    for (const attrs of inlineScripts) {
      expect(attrs).toContain('nonce="%sveltekit.nonce%"');
    }
  });

  it("does not allow unsafe-inline scripts or obsolete Google Fonts origins", () => {
    const directives: Record<string, readonly string[]> = CSP_DIRECTIVES;
    const scriptSrc = directives["script-src"] ?? [];
    expect(scriptSrc).not.toContain("unsafe-inline");

    expect(headersContent).not.toContain("fonts.googleapis.com");
    expect(headersContent).not.toContain("fonts.gstatic.com");

    for (const values of Object.values(directives)) {
      for (const v of values) {
        expect(v).not.toContain("fonts.googleapis.com");
        expect(v).not.toContain("fonts.gstatic.com");
      }
    }
  });
});
