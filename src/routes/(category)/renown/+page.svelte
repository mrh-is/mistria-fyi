<script lang="ts">
  import RenownContent from "#lib/components/renown-content.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<RenownContent locale={data.locale} />
