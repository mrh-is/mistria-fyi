<script lang="ts">
  import NpcRoster from "$lib/components/npc-roster.svelte";

  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();
</script>

<NpcRoster indexed locale={data.locale} />
