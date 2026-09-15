import { SITE_ORIGIN } from "$lib/data/page-metadata.js";

import type { Pathname } from "$app/types";

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
    .map(({ path }) => `  <url>\n    <loc>${new URL(path, SITE_ORIGIN).href}</loc>\n  </url>`)
    .join("\n");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`,
    {
      headers: { "Content-Type": "application/xml" },
    },
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
