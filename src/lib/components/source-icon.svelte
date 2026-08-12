<script lang="ts">
  import { SOURCE_ICON } from "$lib/components/source-icons.js";

  import type { HTMLAttributes } from "svelte/elements";

  import type { RecipeSource } from "$lib/types/tracker-data.js";

  interface Props extends HTMLAttributes<SVGElement> {
    type: RecipeSource["type"];
  }

  let { type, ...rest }: Props = $props();

  const Icon = $derived(SOURCE_ICON[type]);
</script>

<Icon {...rest} />
