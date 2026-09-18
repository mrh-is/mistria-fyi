<script lang="ts">
  import NpcRoster from "$lib/components/npc-roster.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<NpcRoster indexed locale={data.locale} />
