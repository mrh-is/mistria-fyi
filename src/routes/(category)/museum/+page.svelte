<script lang="ts">
  import MuseumContent from "$lib/components/museum-content.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<MuseumContent locale={data.locale} />
