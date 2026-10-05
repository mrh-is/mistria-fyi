<script lang="ts">
  import CosmeticsContent from "#lib/components/cosmetics-content.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<CosmeticsContent locale={data.locale} />
