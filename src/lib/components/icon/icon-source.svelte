<script lang="ts">
  import { SOURCE_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { RecipeSource } from "$lib/types/tracker-data.js";

  interface Props extends LucideProps {
    type: RecipeSource["type"];
  }

  let { type, ...rest }: Props = $props();

  const IconComp = $derived(SOURCE_ICON[type]);
</script>

<IconComp {...rest} />
