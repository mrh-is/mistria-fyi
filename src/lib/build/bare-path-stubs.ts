import { writeFileSync } from "node:fs";
import path from "node:path";

import { BARE_PATHS, barePathStubFile, renderBarePathStub } from "../i18n/bare-path-stub.js";
import { LOCALE_CODES } from "../types/locale.js";

import type { Adapter, Builder } from "@sveltejs/kit";

/** Cloudflare Pages' documented cap on dynamic (splat or placeholder) `_redirects` rules. */
export const REDIRECTS_RULE_LIMIT = 100;

/**
 * Renders the Cloudflare Pages `_redirects` file. Locale URLs are a public contract in BCP 47
 * casing, and retyped or normalized links often change it (`/zh-hans/…`), so each locale's
 * all-lowercase & all-uppercase prefix redirects permanently to the canonical one. Other mixed
 * casings get the not-found page. A canonical prefix is never a source, which would loop.
 */
export function renderRedirectsFile(): string {
  const rules = LOCALE_CODES.flatMap((locale) =>
    [...new Set([locale.toLowerCase(), locale.toUpperCase()])]
      .filter((variant) => variant !== locale)
      .flatMap((variant) => [
        `/${variant} /${locale} 308`,
        `/${variant}/* /${locale}/:splat 308`,
      ]),
  );
  if (rules.length > REDIRECTS_RULE_LIMIT) {
    throw new Error(`_redirects has ${rules.length} rules; Pages caps it at ${REDIRECTS_RULE_LIMIT}.`);
  }
  return [
    "# Generated at build time from src/lib/build/bare-path-stubs.ts. Do not edit; it is not committed.",
    ...rules,
    "",
  ].join("\n");
}

/**
 * `builder`, with a locale-picking stub written beside the prerendered pages at each bare path.
 * The stubs are listed among the prerendered pages too, so `withHeadersFile` gives their inline
 * script a CSP hash the way it does for every prerendered page's start script.
 */
function withStubPages(builder: Builder): Builder {
  const stubFiles = BARE_PATHS.map((barePath) => barePathStubFile(barePath));
  return {
    ...builder,
    prerendered: {
      ...builder.prerendered,
      pages: new Map([
        ...builder.prerendered.pages,
        ...BARE_PATHS.map((barePath) => [barePath, { file: barePathStubFile(barePath) }] as const),
      ]),
    },
    writePrerendered(dest) {
      const written = builder.writePrerendered(dest);
      for (const barePath of BARE_PATHS) {
        writeFileSync(path.join(dest, barePathStubFile(barePath)), renderBarePathStub(barePath));
      }
      return [...written, ...stubFiles];
    },
  };
}

/**
 * Wraps `adapter` so every bare URL lands on the right locale's page without a server: a static
 * stub per bare path picks the locale in the browser, and `_redirects` fixes a miscased locale
 * prefix. `@sveltejs/adapter-cloudflare` copies `_redirects` from the working directory as it
 * adapts the build; the file is gitignored so a hand edit can't drift from this source.
 */
export function withBarePathStubs(adapter: Adapter, directory = process.cwd()): Adapter {
  return {
    ...adapter,
    async adapt(builder) {
      writeFileSync(path.join(directory, "_redirects"), renderRedirectsFile());
      await adapter.adapt(withStubPages(builder));
    },
  };
}
