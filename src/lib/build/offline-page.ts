import { readFileSync } from "node:fs";
import path from "node:path";

import { Window } from "happy-dom";

import { escapeHtml, OFFLINE_FONTS_SLOT } from "../pwa/offline-page.js";
import { LOCALE_CODES } from "../types/locale.js";

import type { OfflinePage } from "../pwa/offline-page.js";
import type { LocaleCode } from "../types/locale.js";
import type { Plugin } from "vite";

/** Where the offline page template takes the app's fonts, tokens & theme bootstrap. */
export const OFFLINE_PAGE_SLOT = "<!-- %offline.app-theme% -->";

/** The module the service worker imports the rendered page from. */
export const OFFLINE_PAGE_MODULE = "virtual:mfg/offline-page";
const RESOLVED_OFFLINE_PAGE_MODULE = `\0${OFFLINE_PAGE_MODULE}`;

/**
 * A template slot the worker fills per locale: `%m.<key>%` for a Paraglide message,
 * `%offline.lang%` & `%offline.dir%` for `<html>`, and the font stylesheet's link. Captured, so
 * splitting the template on it alternates parts & slots.
 */
const LOCALE_SLOT = /%(m\.[a-z][a-z0-9_]*|offline\.(?:lang|dir|fonts))%/;

/** Each locale's parsed `messages/<locale>.json`. */
export type LocaleMessages = Readonly<Record<LocaleCode, Readonly<Record<string, unknown>>>>;

/** Paraglide's `baseLocale`, whose text a locale's missing message falls back to. */
const BASE_LOCALE: LocaleCode = "en";

// Top-level rules in app.css: the selector at the start of a line, the closing brace alone on one.
const FONT_FACE_RULE = /^@font-face \{\n[\s\S]*?^\}$/gm;
const ROOT_RULE = /^:root \{\n[\s\S]*?^\}$/m;
const DARK_RULE = /^\.dark \{\n[\s\S]*?^\}$/m;
// Each locale's font stacks, keyed off `<html lang>`; a rule may list several `html:lang()` selectors.
const LANG_RULE = /^html:lang\([\s\S]*?^\}$/gm;
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
 * `locale`'s text direction, as Paraglide's `getTextDirection` reads it, so `dir` matches the
 * app's `<html dir>`. Read from `Intl` because the build can't import the runtime it compiles.
 */
function textDirection(locale: LocaleCode): "ltr" | "rtl" {
  return new Intl.Locale(locale).getTextInfo().direction === "rtl" ? "rtl" : "ltr";
}

/**
 * `key`'s text in `locale`, falling back to the base locale's as Paraglide's compiled messages do.
 * Throws for a message that isn't plain text: the page has no runtime to fill placeholders.
 */
function messageText(messages: LocaleMessages, locale: LocaleCode, key: string): string {
  const source = messages[locale][key] === undefined ? BASE_LOCALE : locale;
  const text = messages[source][key];
  if (typeof text !== "string") {
    throw new TypeError(`messages/${source}.json has no plain-text "${key}" message.`);
  }
  if (/[{}]/.test(text)) {
    throw new Error(`messages/${source}.json's "${key}" has placeholders the offline page can't fill.`);
  }
  return text;
}

/** Every locale's HTML-escaped value for each of `slots`, the worker's font link excepted. */
function localeCopy(slots: readonly string[], messages: LocaleMessages): OfflinePage["copy"] {
  const entries = LOCALE_CODES.map((locale) => {
    const values = slots
      .filter((slot) => slot !== OFFLINE_FONTS_SLOT)
      .map((slot) => {
        if (slot === "offline.lang") return [slot, locale];
        if (slot === "offline.dir") return [slot, textDirection(locale)];
        return [slot, escapeHtml(messageText(messages, locale, slot.slice("m.".length)))];
      });
    return [locale, Object.fromEntries(values) as Record<string, string>];
  });
  return Object.fromEntries(entries) as OfflinePage["copy"];
}

/**
 * The offline page with `template`'s theme slot filled from the app's own sources, so the page
 * follows them instead of a copy that drifts: `appCss`'s `@font-face` rules, light (`:root`) and
 * dark (`.dark`) tokens & `html:lang()` font stacks, and `appHtml`'s theme bootstrap, which applies
 * the player's saved theme. The scripts' text is copied byte for byte, so the app's CSP hashes for
 * `app.html` allow them unchanged. Its locale slots get every locale's text from `messages`, for
 * the worker to fill per request. Throws when any source has lost its expected shape, rather than
 * render an unstyled or untranslated page.
 */
export function renderOfflinePage(
  template: string,
  appCss: string,
  appHtml: string,
  messages: LocaleMessages,
): OfflinePage {
  if (!template.includes(OFFLINE_PAGE_SLOT)) {
    throw new Error(`The offline page template has no ${OFFLINE_PAGE_SLOT} slot.`);
  }
  const fontFaces = appCss.match(FONT_FACE_RULE);
  if (fontFaces === null) throw new Error("src/app.css has no top-level @font-face rules.");
  const tokens = [requireRule(appCss, ROOT_RULE, ":root"), requireRule(appCss, DARK_RULE, ".dark")];
  const fontStacks = appCss.match(LANG_RULE);
  if (fontStacks === null) throw new Error("src/app.css has no top-level html:lang() rules.");

  const theme = themeElements(appHtml);
  if (!theme.some((element) => element.tag === "script")) {
    throw new Error("src/app.html has no inline <script> theme bootstrap.");
  }
  if (!theme.some((element) => element.tag === "meta")) {
    throw new Error('src/app.html has no <meta name="theme-color"> tag.');
  }

  const style = `<style>\n${[...fontFaces, ...tokens, ...fontStacks].join("\n\n")}\n</style>`;
  const bootstrap = theme.map((element) => element.html).join("\n");
  // Split before the theme goes in, so nothing in app.css or app.html can read as a slot.
  const pieces = template.split(LOCALE_SLOT);
  const parts = pieces
    .filter((_, index) => index % 2 === 0)
    .map((part) => part.replace(OFFLINE_PAGE_SLOT, () => `${style}\n${bootstrap}`));
  const slots = pieces.filter((_, index) => index % 2 === 1);
  return { copy: localeCopy(slots, messages), parts, slots };
}

/**
 * Serves `src/service-worker/offline.html`, rendered, as {@link OFFLINE_PAGE_MODULE}, in dev & build
 * alike. The service worker bundles the page (#226), so it shares no stylesheet with the app, and
 * has no Paraglide runtime; this hands it the app's fonts, colours & saved theme, and every
 * locale's text from `messages/` (#206).
 */
export function offlinePagePlugin(): Plugin {
  let root = process.cwd();
  return {
    configResolved(config) {
      root = config.root;
    },
    enforce: "pre",
    load(id) {
      if (id !== RESOLVED_OFFLINE_PAGE_MODULE) return null;
      const read = (file: string): string => {
        const source = path.resolve(root, file);
        this.addWatchFile(source);
        return readFileSync(source, "utf8");
      };
      const messages = Object.fromEntries(
        LOCALE_CODES.map((locale) => [
          locale,
          JSON.parse(read(`messages/${locale}.json`)) as Record<string, unknown>,
        ]),
      ) as LocaleMessages;
      const page = renderOfflinePage(
        read("src/service-worker/offline.html"),
        read("src/app.css"),
        read("src/app.html"),
        messages,
      );
      return `export default ${JSON.stringify(page)};`;
    },
    name: "mfg:offline-page",
    resolveId(id) {
      return id === OFFLINE_PAGE_MODULE ? RESOLVED_OFFLINE_PAGE_MODULE : null;
    },
  };
}
