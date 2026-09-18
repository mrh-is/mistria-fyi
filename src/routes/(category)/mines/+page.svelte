<script lang="ts">
  import MinesContent from "$lib/components/mines-content.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<MinesContent defaultOpen={true} locale={data.locale} />
