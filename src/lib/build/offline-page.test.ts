import { readFileSync } from "node:fs";
import path from "node:path";

import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import * as m from "../paraglide/messages.js";
import { getTextDirection } from "../paraglide/runtime.js";
import { offlinePageHtml } from "../pwa/offline-page.js";
import { inlineScriptHashes } from "../security/inline-scripts.js";
import { LOCALE_CODES } from "../types/locale.js";
import { OFFLINE_PAGE_SLOT, renderOfflinePage } from "./offline-page.js";

import type { LocaleMessages } from "./offline-page.js";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const REAL_MESSAGES = Object.fromEntries(
  LOCALE_CODES.map((locale) => [
    locale,
    JSON.parse(read(`messages/${locale}.json`)) as Record<string, unknown>,
  ]),
) as LocaleMessages;

/** `messages` for every locale, each one's own text overriding `en`'s. */
function messagesFor(
  en: Record<string, unknown>,
  overrides: Partial<Record<(typeof LOCALE_CODES)[number], Record<string, unknown>>> = {},
): LocaleMessages {
  return Object.fromEntries(
    LOCALE_CODES.map((locale) => [locale, locale === "en" ? en : (overrides[locale] ?? {})]),
  ) as LocaleMessages;
}

const MESSAGES = messagesFor(
  { offline_heading: "You’re offline", offline_retry: "Try <again>" },
  { ja: { offline_heading: "オフラインです" } },
);

function renderReal(): ReturnType<typeof renderOfflinePage> {
  return renderOfflinePage(
    read("src/service-worker/offline.html"),
    read("src/app.css"),
    read("src/app.html"),
    REAL_MESSAGES,
  );
}

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

html:lang(ja),
html:lang(ko) {
  font-synthesis: none;
}

@theme {
  --font-sans: "Petrona";
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

const TEMPLATE = `<html lang="%offline.lang%" dir="%offline.dir%"><head>${OFFLINE_PAGE_SLOT}
%offline.fonts%</head><body><h1>%m.offline_heading%</h1><a>%m.offline_retry%</a></body></html>`;

/** `TEMPLATE` rendered in `locale`, from `appCss` & `appHtml`. */
function render(appCss = APP_CSS, appHtml = APP_HTML, locale: "en" | "ja" = "en"): string {
  return offlinePageHtml(renderOfflinePage(TEMPLATE, appCss, appHtml, MESSAGES), locale, undefined);
}

describe("renderOfflinePage", () => {
  it("fills the slot with app.css's fonts, theme tokens & locale font stacks and app.html's theme bootstrap", () => {
    const html = render();

    expect(html).not.toContain(OFFLINE_PAGE_SLOT);
    expect(html).toContain('src: url("/fonts/petrona-latin.woff2")');
    expect(html).toContain(":root {\n  /* Light */\n  --color-paper: #f7f5f0;");
    expect(html).toContain(".dark {\n  --color-paper: #222226;\n}");
    expect(html).toContain('html:lang(ja) {\n  --font-body: "BIZ UDPMincho";\n}');
    expect(html).toContain("html:lang(ja),\nhtml:lang(ko) {\n  font-synthesis: none;\n}");
    expect(html).not.toContain("tailwindcss");
    expect(html).not.toContain("@theme");
    // The theme-color tag precedes the script that rewrites it, as in app.html.
    expect(html.indexOf('name="theme-color"')).toBeLessThan(html.indexOf("querySelector"));
    expect(html).not.toContain('charset="utf-8"');
  });

  it("copies app.html's scripts byte for byte, so the app's CSP hashes still allow them", () => {
    expect(inlineScriptHashes(render())).toEqual(inlineScriptHashes(APP_HTML));
  });

  it("parses mixed-case tags and ignores comments and external scripts", () => {
    const html = render(
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

  it("gives each locale its lang, dir & messages, escaped, falling back to English", () => {
    const en = render();
    expect(en).toMatch(/^<html lang="en" dir="ltr">/);
    expect(en).toContain("<h1>You’re offline</h1><a>Try &lt;again&gt;</a>");

    const ja = render(APP_CSS, APP_HTML, "ja");
    expect(ja).toMatch(/^<html lang="ja" dir="ltr">/);
    // ja has no retry message of its own, so it takes English's, as Paraglide does.
    expect(ja).toContain("<h1>オフラインです</h1><a>Try &lt;again&gt;</a>");
  });

  it("never reads a slot from the app's own sources", () => {
    const page = renderOfflinePage(
      TEMPLATE,
      APP_CSS,
      `${APP_HTML}<script>"%m.offline_heading%"</script>`,
      MESSAGES,
    );

    expect(page.slots).toEqual(["offline.lang", "offline.dir", "offline.fonts", "m.offline_heading", "m.offline_retry"]);
    expect(offlinePageHtml(page, "en", undefined)).toContain('<script>"%m.offline_heading%"</script>');
  });

  it("throws when the template has no slot", () => {
    expect(() => renderOfflinePage("<html></html>", APP_CSS, APP_HTML, MESSAGES)).toThrow(/slot/);
  });

  it("throws when app.css has no font faces, theme blocks or locale font stacks", () => {
    expect(() =>
      renderOfflinePage(TEMPLATE, ":root {\n}\n.dark {\n}\n", APP_HTML, MESSAGES),
    ).toThrow(/@font-face/);
    expect(() =>
      renderOfflinePage(TEMPLATE, APP_CSS.replace(".dark", ".night"), APP_HTML, MESSAGES),
    ).toThrow(/\.dark/);
    expect(() =>
      renderOfflinePage(TEMPLATE, APP_CSS.replaceAll("html:lang", "body:lang"), APP_HTML, MESSAGES),
    ).toThrow(/html:lang/);
  });

  it("throws when app.html has no theme bootstrap", () => {
    expect(() =>
      renderOfflinePage(TEMPLATE, APP_CSS, '<meta name="theme-color" content="#fff" />', MESSAGES),
    ).toThrow(/script/);
    expect(() =>
      renderOfflinePage(TEMPLATE, APP_CSS, "<script>document.title = 'x';</script>", MESSAGES),
    ).toThrow(/theme-color/);
  });

  it("throws for a missing English message or one with placeholders", () => {
    expect(() =>
      renderOfflinePage(TEMPLATE, APP_CSS, APP_HTML, messagesFor({ offline_heading: "Offline" })),
    ).toThrow(/messages\/en\.json has no plain-text "offline_retry"/);
    expect(() =>
      renderOfflinePage(
        TEMPLATE,
        APP_CSS,
        APP_HTML,
        messagesFor(
          { offline_heading: "Offline", offline_retry: "Retry" },
          { fr: { offline_retry: "Réessayer {count}" } },
        ),
      ),
    ).toThrow(/messages\/fr\.json's "offline_retry" has placeholders/);
  });

  it("renders the real offline page from the real app files", () => {
    const html = offlinePageHtml(renderReal(), "en", undefined);

    expect(html).toContain("mistria-fyi:theme");
    expect(html).toContain("--color-paper:");
    expect(html).toContain('font-family: "Petrona"');
    expect(html).toContain("html:lang(ja)");
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/%(m|offline)\.[\w-]+%/);
    expect(inlineScriptHashes(html)).toEqual(inlineScriptHashes(read("src/app.html")));
  });

  it.each(LOCALE_CODES)("gives the real %s page the app's lang, dir & messages", (locale) => {
    const window = new Window();
    try {
      const html = offlinePageHtml(renderReal(), locale, undefined);
      const document = new window.DOMParser().parseFromString(html, "text/html");
      const text = (selector: string) => document.querySelector(selector)?.textContent;

      expect(document.documentElement.lang).toBe(locale);
      expect(document.documentElement.dir).toBe(getTextDirection(locale));
      expect(document.title).toBe(m.offline_page_title({}, { locale }));
      expect(text(".eyebrow")).toBe(m.offline_eyebrow({}, { locale }));
      expect(text("h1")).toBe(m.offline_heading({}, { locale }));
      expect(text(".eyebrow + h1 + p")).toBe(m.offline_body({}, { locale }));
      expect(text(".retry")).toBe(m.action_retry({}, { locale }));
    } finally {
      window.close();
    }
  });
});
