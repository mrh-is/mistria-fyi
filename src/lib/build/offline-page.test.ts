import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { inlineScriptHashes } from "../security/inline-scripts.js";
import { OFFLINE_PAGE_SLOT, renderOfflinePage } from "./offline-page.js";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const APP_CSS = `@import "tailwindcss";

@font-face {
  font-family: "Petrona";
  src: url("/fonts/petrona-latin.woff2") format("woff2");
}

:root {
  /* Light */
  --color-paper: #f7f5f0;
  --background: var(--color-paper);
}

.dark {
  --color-paper: #222226;
}

html:lang(ja) {
  --font-body: "BIZ UDPMincho";
}
`;

const APP_HTML = `<!doctype html>
<html lang="%lang%">
  <head>
    <script>
      document.documentElement.classList.add("dark");
    </script>
    <meta charset="utf-8" />
    <meta name="theme-color" content="#f7f5f0" />
    <script>
      document.querySelector('meta[name="theme-color"]').content = "#222226";
    </script>
    %sveltekit.head%
  </head>
</html>`;

const TEMPLATE = `<html><head>${OFFLINE_PAGE_SLOT}</head><body></body></html>`;

describe("renderOfflinePage", () => {
  it("fills the slot with app.css's fonts & theme tokens and app.html's theme bootstrap", () => {
    const html = renderOfflinePage(TEMPLATE, APP_CSS, APP_HTML);

    expect(html).not.toContain(OFFLINE_PAGE_SLOT);
    expect(html).toContain('src: url("/fonts/petrona-latin.woff2")');
    expect(html).toContain(":root {\n  /* Light */\n  --color-paper: #f7f5f0;");
    expect(html).toContain(".dark {\n  --color-paper: #222226;\n}");
    expect(html).not.toContain("tailwindcss");
    expect(html).not.toContain("BIZ UDPMincho");
    // The theme-color tag precedes the script that rewrites it, as in app.html.
    expect(html.indexOf('name="theme-color"')).toBeLessThan(html.indexOf("querySelector"));
    expect(html).not.toContain('charset="utf-8"');
  });

  it("copies app.html's scripts byte for byte, so the app's CSP hashes still allow them", () => {
    const html = renderOfflinePage(TEMPLATE, APP_CSS, APP_HTML);

    expect(inlineScriptHashes(html)).toEqual(inlineScriptHashes(APP_HTML));
  });

  it("parses mixed-case tags and ignores comments and external scripts", () => {
    const html = renderOfflinePage(
      TEMPLATE,
      APP_CSS,
      `<!-- <script>commentedOut()</script> -->
<SCRIPT data-label=">">first()</SCRIPT>
<script src="external.js"></script>
<META content="#fff" NAME="theme-color">
<ScRiPt>second()</sCrIpT>`,
    );

    expect(html).toContain('<script data-label=">">first()</script>');
    expect(html).toContain('<meta content="#fff" name="theme-color">');
    expect(html).toContain("<script>second()</script>");
    expect(html).not.toContain("commentedOut");
    expect(html).not.toContain("external.js");
  });

  it("throws when the template has no slot", () => {
    expect(() => renderOfflinePage("<html></html>", APP_CSS, APP_HTML)).toThrow(/slot/);
  });

  it("throws when app.css has no font faces or theme blocks", () => {
    expect(() => renderOfflinePage(TEMPLATE, ":root {\n}\n.dark {\n}\n", APP_HTML)).toThrow(
      /@font-face/,
    );
    expect(() => renderOfflinePage(TEMPLATE, APP_CSS.replace(".dark", ".night"), APP_HTML)).toThrow(
      /\.dark/,
    );
  });

  it("throws when app.html has no theme bootstrap", () => {
    expect(() =>
      renderOfflinePage(TEMPLATE, APP_CSS, '<meta name="theme-color" content="#fff" />'),
    ).toThrow(/script/);
    expect(() =>
      renderOfflinePage(TEMPLATE, APP_CSS, "<script>document.title = 'x';</script>"),
    ).toThrow(/theme-color/);
  });

  it("renders the real offline page from the real app files", () => {
    const html = renderOfflinePage(
      read("src/service-worker/offline.html"),
      read("src/app.css"),
      read("src/app.html"),
    );

    expect(html).toContain("mistria-fyi:theme");
    expect(html).toContain("--color-paper:");
    expect(html).toContain('font-family: "Petrona"');
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(inlineScriptHashes(html)).toEqual(inlineScriptHashes(read("src/app.html")));
  });
});
