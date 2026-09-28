import { SITE_ORIGIN } from "$lib/data/page-metadata.js";
import { locales, localizeUrl } from "$lib/paraglide/runtime.js";

import type { Load } from "@sveltejs/kit";

import type { Pathname } from "$app/types";
import type { RobotsDirective } from "$lib/data/page-metadata";
import type { Locale } from "$lib/paraglide/runtime.js";

export const prerender = true;

/**
 * What the sitemap reads from each `+page.ts`. It doesn't run `load()`, which needs a real request
 * to resolve the locale & name chunks; a page that opts out of indexing says so with a static
 * `_robots` export instead (SvelteKit reserves unprefixed `+page.ts` exports).
 */
interface PageModule {
  _robots?: RobotsDirective;
  load: Load;
}

const pageComponents = import.meta.glob("/src/routes/**/+page.svelte");
const pageModules: Partial<Record<string, PageModule>> = import.meta.glob<PageModule>(
  "/src/routes/**/+page.ts",
  { eager: true },
);

/** Every rendered page's route path and `+page.ts` module, in glob order. */
export function _pageEntries(): {
  modulePath: string;
  pageModule: PageModule;
  path: Pathname;
}[] {
  return Object.keys(pageComponents).map((componentPath) => {
    const modulePath = componentPath.replace(/\.svelte$/, ".ts");
    const pageModule = pageModules[modulePath];

    if (!pageModule) {
      throw new Error(`Page metadata load is missing for ${componentPath}`);
    }

    return { modulePath, pageModule, path: routePathForModule(modulePath) };
  });
}

export function GET(): Response {
  const urls = _pageEntries()
    .filter(({ pageModule }) => pageModule._robots === undefined)
    .flatMap(({ path }) => localizedUrlEntries(path))
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`,
    {
      headers: { "Content-Type": "application/xml" },
    },
  );
}

/** One `<url>` entry per locale for `path`, each cross-linked to the other locales' URLs. */
function localizedUrlEntries(path: Pathname): string[] {
  const canonicalUrl = new URL(path, SITE_ORIGIN);
  const hrefByLocale = new Map(
    locales.map((locale) => [locale, localizeUrl(canonicalUrl, { locale }).href]),
  );

  const alternateLinks = locales
    .map(
      (locale) =>
        `    <xhtml:link rel="alternate" hreflang="${locale}" href="${hrefByLocale.get(locale)}" />`,
    )
    .join("\n");

  return locales.map(
    (locale: Locale) =>
      `  <url>\n    <loc>${hrefByLocale.get(locale)}</loc>\n${alternateLinks}\n  </url>`,
  );
}

function routePathForModule(modulePath: string): Pathname {
  const routeSegments = modulePath
    .replace(/^\/src\/routes\/?/, "")
    .replace(/(^|\/)\+page\.ts$/, "")
    .split("/")
    .filter((segment) => segment && !(segment.startsWith("(") && segment.endsWith(")")));

  return `/${routeSegments.join("/")}` as Pathname;
}
