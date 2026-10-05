<script lang="ts">
  import QuestsContent from "#lib/components/quests-content.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<QuestsContent locale={data.locale} />
