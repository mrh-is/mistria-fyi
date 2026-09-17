<script lang="ts">
  import AlmanacContent from "$lib/components/almanac-content.svelte";

  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();
</script>

<AlmanacContent locale={data.locale} />
