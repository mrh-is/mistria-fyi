import { SITE_ORIGIN } from "$lib/data/page-metadata.js";
import { locales, localizeUrl } from "$lib/paraglide/runtime.js";

import type { Pathname } from "$app/types";
import type { Locale } from "$lib/paraglide/runtime.js";

export const prerender = true;

interface MetadataPageModule {
  load: () => App.PageData | Promise<App.PageData>;
}

const pageComponents = import.meta.glob("/src/routes/**/+page.svelte");
const pageModules: Partial<Record<string, MetadataPageModule>> =
  import.meta.glob<MetadataPageModule>("/src/routes/**/+page.ts", {
    eager: true,
  });

export async function _pageMetadataEntries() {
  return Promise.all(
    Object.keys(pageComponents).map(async (componentPath) => {
      const modulePath = componentPath.replace(/\.svelte$/, ".ts");
      const pageModule = pageModules[modulePath];

      if (!pageModule) {
        throw new Error(`Page metadata load is missing for ${componentPath}`);
      }

      const { metadata } = await pageModule.load();
      return { metadata, modulePath, path: routePathForModule(modulePath) };
    }),
  );
}

export async function GET(): Promise<Response> {
  const metadataEntries = await _pageMetadataEntries();
  const urls = metadataEntries
    .filter(({ metadata }) => metadata.robots === undefined)
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
