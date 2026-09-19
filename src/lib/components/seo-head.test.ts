import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import { pageMetadata, SITE_NAME, SITE_ORIGIN } from "$lib/data/page-metadata.js";
import { LOCALE_CODES } from "$lib/types/locale.js";

import SeoHead from "./seo-head.svelte";

describe("SEO head", () => {
  it("renders one complete set of text and share-image metadata", () => {
    const metadata = pageMetadata({
      description: "Track every museum collection and donation in Fields of Mistria.",
      title: "Museum",
    });
    const { head } = render(SeoHead, { props: { metadata, pathname: "/museum" } });
    const canonicalUrl = new URL("/museum", SITE_ORIGIN).href;
    const title = `${metadata.title} — ${SITE_NAME}`;

    expect(head).toContain(`<title>${title}</title>`);
    expect(head).toContain(`<meta name="description" content="${metadata.description}"/>`);
    expect(head).toContain(`<link rel="canonical" href="${canonicalUrl}"/>`);
    expect(head).toContain(`<meta property="og:title" content="${title}"/>`);
    expect(head).toContain(`<meta property="og:description" content="${metadata.description}"/>`);
    expect(head).toContain(`<meta property="og:url" content="${canonicalUrl}"/>`);
    expect(head).toContain('<meta property="og:type" content="website"/>');
    expect(head).toContain('<meta property="og:site_name" content="Mistria Field Guide"/>');
    expect(head).toContain(`<meta property="og:image" content="${SITE_ORIGIN}/og-image.png"/>`);
    expect(head).toContain('<meta property="og:image:type" content="image/png"/>');
    expect(head).toContain('<meta property="og:image:width" content="1200"/>');
    expect(head).toContain('<meta property="og:image:height" content="630"/>');
    expect(head).toContain(
      '<meta property="og:image:alt" content="Mistria Field Guide showing an Everything progress stripe at 27% completion."/>',
    );
    expect(head).toContain('<meta name="twitter:card" content="summary_large_image"/>');
    expect(head).toContain(`<meta name="twitter:image" content="${SITE_ORIGIN}/og-image.png"/>`);
    expect(head).toContain(
      '<meta name="twitter:image:alt" content="Mistria Field Guide showing an Everything progress stripe at 27% completion."/>',
    );
    expect(head).toContain(`<meta name="twitter:title" content="${title}"/>`);
    expect(head).toContain(`<meta name="twitter:description" content="${metadata.description}"/>`);
    expect(head).not.toContain('name="robots"');
  });

  it("emits one hreflang alternate per locale, including the page's own locale", () => {
    const metadata = pageMetadata({
      description: "Track every museum collection.",
      title: "Museum",
    });
    const { head } = render(SeoHead, { props: { metadata, pathname: "/ja/museum" } });

    const alternates = head.match(/<link rel="alternate" hreflang="[^"]+" href="[^"]+"\/>/g) ?? [];
    expect(alternates).toHaveLength(LOCALE_CODES.length);
    for (const locale of LOCALE_CODES) {
      expect(head).toContain(
        `<link rel="alternate" hreflang="${locale}" href="${SITE_ORIGIN}/${locale}/museum"/>`,
      );
    }
    expect(head).not.toContain("[locale]");
  });

  it("renders an explicit robots directive for non-indexable pages", () => {
    const metadata = pageMetadata({
      description: "Manage Fields of Mistria tracking data.",
      robots: "noindex, follow" as const,
      title: "Data management",
    });
    const { head } = render(SeoHead, { props: { metadata, pathname: "/data" } });

    expect(head).toContain('<meta name="robots" content="noindex, follow"/>');
  });

  it("uses the site name without duplicating it on the homepage", () => {
    const metadata = pageMetadata({
      description: "Track Fields of Mistria completion progress.",
      title: SITE_NAME,
    });
    const { head } = render(SeoHead, { props: { metadata, pathname: "/" } });

    expect(head).toContain(`<title>${SITE_NAME}</title>`);
    expect(head).not.toContain(`${SITE_NAME} — ${SITE_NAME}`);
  });
});
