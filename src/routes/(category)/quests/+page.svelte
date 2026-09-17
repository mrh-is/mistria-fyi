<script lang="ts">
  import QuestsContent from "$lib/components/quests-content.svelte";

  import type { PageProps } from "./$types.js";

  let { data }: PageProps = $props();
</script>

<QuestsContent locale={data.locale} />
