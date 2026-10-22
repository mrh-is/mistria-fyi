import { readFileSync } from "node:fs";
import path from "node:path";

import { Window } from "happy-dom";

import type { Plugin } from "vite";

/** Where the offline page template takes the app's fonts, tokens & theme bootstrap. */
export const OFFLINE_PAGE_SLOT = "<!-- %offline.app-theme% -->";

/** The service worker's import of the template, as Vite resolves it. */
const OFFLINE_PAGE_IMPORT = "/src/service-worker/offline.html?raw";

// Top-level rules in app.css: the selector at the start of a line, the closing brace alone on one.
const FONT_FACE_RULE = /^@font-face \{\n[\s\S]*?^\}$/gm;
const ROOT_RULE = /^:root \{\n[\s\S]*?^\}$/m;
const DARK_RULE = /^\.dark \{\n[\s\S]*?^\}$/m;
// app.html's theme bootstrap: its inline scripts & the `theme-color` tag one of them rewrites.
const THEME_SELECTOR = 'script:not([src]), meta[name="theme-color"]';

/**
 * `appHtml`'s theme bootstrap elements in document order, read with a real HTML parser (as
 * `theme-bootstrap.client.test.ts` does) so tag case, attributes & comments parse as a browser
 * would. Serializing normalizes the tags, but a script's text, and so its CSP hash, is unchanged.
 */
function themeElements(appHtml: string): { html: string; tag: string }[] {
  const window = new Window();
  try {
    const document = new window.DOMParser().parseFromString(appHtml, "text/html");
    return [...document.querySelectorAll(THEME_SELECTOR)].map((element) => ({
      html: element.outerHTML,
      tag: element.localName,
    }));
  } finally {
    window.close();
  }
}

function requireRule(css: string, rule: RegExp, selector: string): string {
  const match = rule.exec(css)?.[0];
  if (match === undefined) throw new Error(`src/app.css has no top-level ${selector} rule.`);
  return match;
}

/**
 * The offline page with `template`'s slot filled from the app's own sources, so the page follows
 * them instead of a copy that drifts: `appCss`'s `@font-face` rules & light (`:root`) and dark
 * (`.dark`) tokens, and `appHtml`'s theme bootstrap, which applies the player's saved theme. The
 * scripts' text is copied byte for byte, so the app's CSP hashes for `app.html` allow them unchanged.
 * Throws when any source has lost its expected shape, rather than render an unstyled page.
 */
export function renderOfflinePage(template: string, appCss: string, appHtml: string): string {
  if (!template.includes(OFFLINE_PAGE_SLOT)) {
    throw new Error(`The offline page template has no ${OFFLINE_PAGE_SLOT} slot.`);
  }
  const fontFaces = appCss.match(FONT_FACE_RULE);
  if (fontFaces === null) throw new Error("src/app.css has no top-level @font-face rules.");
  const tokens = [requireRule(appCss, ROOT_RULE, ":root"), requireRule(appCss, DARK_RULE, ".dark")];

  const theme = themeElements(appHtml);
  if (!theme.some((element) => element.tag === "script")) {
    throw new Error("src/app.html has no inline <script> theme bootstrap.");
  }
  if (!theme.some((element) => element.tag === "meta")) {
    throw new Error('src/app.html has no <meta name="theme-color"> tag.');
  }

  const style = `<style>\n${[...fontFaces, ...tokens].join("\n\n")}\n</style>`;
  const bootstrap = theme.map((element) => element.html);
  return template.replace(OFFLINE_PAGE_SLOT, () => [style, ...bootstrap].join("\n"));
}

/**
 * Renders `src/service-worker/offline.html` in place of its raw import, in dev & build alike. The
 * service worker bundles the page as a string (#226), so it shares no stylesheet with the app; this
 * hands it the app's fonts, colours & saved theme instead.
 */
export function offlinePagePlugin(): Plugin {
  let root = process.cwd();
  return {
    configResolved(config) {
      root = config.root;
    },
    enforce: "pre",
    load(id) {
      if (!id.endsWith(OFFLINE_PAGE_IMPORT)) return null;
      const sources = ["src/service-worker/offline.html", "src/app.css", "src/app.html"].map(
        (file) => path.resolve(root, file),
      );
      for (const source of sources) this.addWatchFile(source);
      const [template = "", appCss = "", appHtml = ""] = sources.map((source) =>
        readFileSync(source, "utf8"),
      );
      return `export default ${JSON.stringify(renderOfflinePage(template, appCss, appHtml))};`;
    },
    name: "mfg:offline-page",
  };
}
