import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import { SITE_NAME, SITE_ORIGIN } from "$lib/data/page-metadata.js";

import SeoHead from "./seo-head.svelte";

describe("SEO head", () => {
  it("renders one complete set of text metadata without claiming a share image", () => {
    const metadata = {
      description: "Track every museum collection and donation in Fields of Mistria.",
      path: "/museum" as const,
      title: "Museum tracker",
    };
    const { head } = render(SeoHead, { props: { metadata } });
    const canonicalUrl = new URL(metadata.path, SITE_ORIGIN).href;
    const title = `${metadata.title} — ${SITE_NAME}`;

    expect(head).toContain(`<title>${title}</title>`);
    expect(head).toContain(`<meta name="description" content="${metadata.description}"/>`);
    expect(head).toContain(`<link rel="canonical" href="${canonicalUrl}"/>`);
    expect(head).toContain(`<meta property="og:title" content="${title}"/>`);
    expect(head).toContain(`<meta property="og:description" content="${metadata.description}"/>`);
    expect(head).toContain(`<meta property="og:url" content="${canonicalUrl}"/>`);
    expect(head).toContain('<meta property="og:type" content="website"/>');
    expect(head).toContain('<meta property="og:site_name" content="Mistria Field Guide"/>');
    expect(head).toContain('<meta name="twitter:card" content="summary"/>');
    expect(head).toContain(`<meta name="twitter:title" content="${title}"/>`);
    expect(head).toContain(`<meta name="twitter:description" content="${metadata.description}"/>`);
    expect(head).not.toContain("og:image");
    expect(head).not.toContain("twitter:image");
    expect(head).not.toContain('name="robots"');
  });

  it("renders an explicit robots directive for non-indexable pages", () => {
    const metadata = {
      description: "Manage Fields of Mistria tracking data.",
      path: "/data" as const,
      robots: "noindex, follow" as const,
      title: "Data management",
    };
    const { head } = render(SeoHead, { props: { metadata } });

    expect(head).toContain('<meta name="robots" content="noindex, follow"/>');
  });
});
