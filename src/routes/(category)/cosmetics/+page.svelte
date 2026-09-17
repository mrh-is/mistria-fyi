<script lang="ts">
  import CosmeticsContent from "$lib/components/cosmetics-content.svelte";

  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();
</script>

<CosmeticsContent locale={data.locale} />
