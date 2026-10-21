import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CSP_DIRECTIVES } from "../security/csp-directives.js";
import { serializeCsp } from "../security/security-headers.js";
import { HEADERS_LINE_LIMIT, renderHeadersFile, withHeadersFile } from "./headers-file.js";

import type { Adapter, Builder } from "@sveltejs/kit";

const PRODUCTION_CSP = serializeCsp(CSP_DIRECTIVES);

// `printf '<code>' | openssl dgst -sha256 -binary | base64`
const START_EN = "sha256-KQ36U2BJQw7Wktunf6gqHkmGb+CzAFKA+nx9sLFgmBY=";
const START_JA = "sha256-xL1MueaTMvNjk23BDK9GezjjqQAlwRiRBDAY7rRUET4=";

function page(pagePath: string, startScript: string) {
  return { html: `<html><head><script>${startScript}</script></head></html>`, path: pagePath };
}

describe("renderHeadersFile", () => {
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

  it("gives each prerendered route one rule that replaces the CSP with its scripts' hashes", () => {
    const lines = renderHeadersFile(CSP_DIRECTIVES, [
      page("/en/data", 'start("en")'),
      page("/ja/data", 'start("ja")'),
    ]).split("\n");

    const rule = lines.indexOf("/:locale/data");
    expect(rule).toBeGreaterThan(0);
    expect(lines[rule + 1]).toBe("  ! Content-Security-Policy");
    const policy = lines[rule + 2]?.replace("  Content-Security-Policy: ", "") ?? "";
    expect(policy).toBe(
      PRODUCTION_CSP.replace(
        "https://challenges.cloudflare.com; style-src",
        `https://challenges.cloudflare.com '${START_EN}' '${START_JA}'; style-src`,
      ),
    );
    // A `<meta>` policy can't carry it, so the header must.
    expect(policy).toContain("frame-ancestors 'none'");
    // Only the CSP is replaced; the `/*` rule's other headers still apply once.
    expect(lines.filter((line) => line.includes("X-Content-Type-Options"))).toHaveLength(1);
  });

  it("keeps a locale home's literal path, since `/:locale` would match top-level files", () => {
    const lines = renderHeadersFile(CSP_DIRECTIVES, [page("/en", 'start("en")')]).split("\n");
    expect(lines).toContain("/en");
    expect(lines).not.toContain("/:locale");
  });

  it("keeps unlocalized prerendered paths literal", () => {
    const lines = renderHeadersFile(CSP_DIRECTIVES, [page("/sitemap.xml", "")]).split("\n");
    expect(lines).toContain("/sitemap.xml");
  });

  it("refuses a line Pages would reject", () => {
    const pages = Array.from({ length: 80 }, (_, index) =>
      page(`/en/route${index % 2}`, `start(${index})`),
    );
    expect(() => renderHeadersFile(CSP_DIRECTIVES, pages)).toThrow(
      new RegExp(`caps lines at ${HEADERS_LINE_LIMIT}`),
    );
  });

  it("refuses more rules than Pages allows", () => {
    const pages = Array.from({ length: 100 }, (_, index) => page(`/en/route${index}`, ""));
    expect(() => renderHeadersFile(CSP_DIRECTIVES, pages)).toThrow(/caps it at 100/);
  });
});

describe("withHeadersFile", () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory !== undefined) rmSync(directory, { force: true, recursive: true });
  });

  it("writes _headers from the prerendered pages before the adapter reads it", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "headers-file-"));
    const outputDirectory = directory;
    let seenByAdapter: string | undefined;
    const inner: Adapter = {
      adapt: vi.fn(() => {
        seenByAdapter = readFileSync(path.join(outputDirectory, "_headers"), "utf8");
      }),
      name: "inner",
    };
    const builder = {
      prerendered: { pages: new Map([["/en/data", { file: "en/data.html" }]]) },
      writePrerendered(dest: string) {
        mkdirSync(path.join(dest, "en"), { recursive: true });
        writeFileSync(path.join(dest, "en", "data.html"), page("/en/data", 'start("en")').html);
        return [];
      },
    } as unknown as Builder;

    const adapter = withHeadersFile(inner, CSP_DIRECTIVES, outputDirectory);
    expect(adapter.name).toBe("inner");
    await adapter.adapt(builder);

    expect(inner.adapt).toHaveBeenCalledWith(builder);
    expect(seenByAdapter).toBe(
      renderHeadersFile(CSP_DIRECTIVES, [page("/en/data", 'start("en")')]),
    );
    expect(seenByAdapter).toContain(START_EN);
  });
});
