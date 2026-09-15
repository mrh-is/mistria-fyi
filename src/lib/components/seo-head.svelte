<script lang="ts">
  import type { ResolvedPageMetadata } from "$lib/data/page-metadata.js";

  let { metadata }: { metadata: ResolvedPageMetadata } = $props();
</script>

<svelte:head>
  <title>{metadata.title}</title>
  <meta name="description" content={metadata.description} />
  <link rel="canonical" href={metadata.canonicalUrl} />
  <meta property="og:title" content={metadata.title} />
  <meta property="og:description" content={metadata.description} />
  <meta property="og:url" content={metadata.canonicalUrl} />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Mistria Field Guide" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content={metadata.title} />
  <meta name="twitter:description" content={metadata.description} />
  {#if metadata.robots}
    <meta name="robots" content={metadata.robots} />
  {/if}
</svelte:head>
