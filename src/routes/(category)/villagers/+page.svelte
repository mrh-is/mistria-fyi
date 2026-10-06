<script lang="ts">
  import VillagersContent from "#lib/components/villagers-content.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<VillagersContent indexed locale={data.locale} />
