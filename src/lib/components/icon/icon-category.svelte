<script lang="ts">
  import { CATEGORY_ICON } from "$lib/components/icon/icon-maps.js";
  import { categoryForKey, type CategoryKey } from "$lib/data/categories.js";

  import type { LucideProps } from "$lib/components/icon/icon-maps.js";

  interface Props extends LucideProps {
    category: "all" | "complete" | CategoryKey;
    useCategoryColor?: true;
  }

  let { category, useCategoryColor, ...rest }: Props = $props();

  const { color } = $derived.by(() => {
    if (category === "all") return { color: "muted-foreground" };
    if (category === "complete") return { color: "yellow-700" };
    return categoryForKey(category);
  });

  const IconComp = $derived(CATEGORY_ICON[category]);
</script>

<IconComp {...rest} color={useCategoryColor ? `var(--${color})` : undefined} />
