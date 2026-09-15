import { SITE_ORIGIN } from "$lib/data/page-metadata.js";
import { PAGE_METADATA } from "$lib/server/page-metadata.js";

export const prerender = true;

export function GET(): Response {
  const urls = PAGE_METADATA.filter(({ robots }) => robots === undefined)
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
