<script lang="ts">
  import { SITE_NAME, SITE_ORIGIN } from "$lib/data/page-metadata.js";

  import type { PageMetadata } from "$lib/data/page-metadata.js";

  let { metadata, pathname }: { metadata: PageMetadata; pathname: string } = $props();
  let canonicalUrl = $derived(new URL(pathname, SITE_ORIGIN).href);
  let title = $derived(
    metadata.title === SITE_NAME ? SITE_NAME : `${metadata.title} — ${SITE_NAME}`,
  );
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={metadata.description} />
  <link rel="canonical" href={canonicalUrl} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={metadata.description} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={SITE_NAME} />
  <meta property="og:image" content="{SITE_ORIGIN}/og-image.png" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta
    property="og:image:alt"
    content="Mistria Field Guide showing an Everything progress stripe at 27% completion."
  />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="{SITE_ORIGIN}/og-image.png" />
  <meta
    name="twitter:image:alt"
    content="Mistria Field Guide showing an Everything progress stripe at 27% completion."
  />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={metadata.description} />
  {#if metadata.robots}
    <meta name="robots" content={metadata.robots} />
  {/if}
</svelte:head>
