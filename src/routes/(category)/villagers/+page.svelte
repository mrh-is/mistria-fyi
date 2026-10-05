<script lang="ts">
  import VillagerRoster from "#lib/components/villager-roster.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<VillagerRoster indexed locale={data.locale} />
