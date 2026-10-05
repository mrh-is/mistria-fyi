<script lang="ts">
  import AnimalsContent from "#lib/components/animals-content.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<AnimalsContent locale={data.locale} />
