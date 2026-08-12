<script lang="ts">
  import { CATEGORY_ICON } from "$lib/components/icon/icon-maps.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";
  import type { CategoryKey } from "$lib/data/categories.js";

  interface Props extends LucideProps {
    category: "all" | "complete" | CategoryKey;
  }

  let { category, ...rest }: Props = $props();

  const IconComp = $derived(CATEGORY_ICON[category]);
</script>

<IconComp {...rest} />
