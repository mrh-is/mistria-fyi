<script lang="ts">
  import RecipesContent from "$lib/components/recipes-content.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<RecipesContent locale={data.locale} />
