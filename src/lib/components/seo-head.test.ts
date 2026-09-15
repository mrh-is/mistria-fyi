import { render } from "svelte/server";
import { describe, expect, it } from "vitest";

import { resolvePageMetadata } from "$lib/data/page-metadata.js";

import SeoHead from "./seo-head.svelte";

describe("SEO head", () => {
  it("renders one complete set of text metadata without claiming a share image", () => {
    const metadata = resolvePageMetadata("/museum", 200);
    const { head } = render(SeoHead, { props: { metadata } });

    expect(head).toContain(`<title>${metadata.title}</title>`);
    expect(head).toContain(`<meta name="description" content="${metadata.description}"/>`);
    expect(head).toContain(`<link rel="canonical" href="${metadata.canonicalUrl}"/>`);
    expect(head).toContain(`<meta property="og:title" content="${metadata.title}"/>`);
    expect(head).toContain(`<meta property="og:description" content="${metadata.description}"/>`);
    expect(head).toContain(`<meta property="og:url" content="${metadata.canonicalUrl}"/>`);
    expect(head).toContain('<meta property="og:type" content="website"/>');
    expect(head).toContain('<meta property="og:site_name" content="Mistria Field Guide"/>');
    expect(head).toContain('<meta name="twitter:card" content="summary"/>');
    expect(head).toContain(`<meta name="twitter:title" content="${metadata.title}"/>`);
    expect(head).toContain(`<meta name="twitter:description" content="${metadata.description}"/>`);
    expect(head).not.toContain("og:image");
    expect(head).not.toContain("twitter:image");
    expect(head).not.toContain('name="robots"');
  });

  it("renders an explicit robots directive for non-indexable pages", () => {
    const metadata = resolvePageMetadata("/data", 200);
    const { head } = render(SeoHead, { props: { metadata } });

    expect(head).toContain('<meta name="robots" content="noindex, follow"/>');
  });
});
