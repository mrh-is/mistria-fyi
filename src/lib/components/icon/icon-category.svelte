<script lang="ts">
  import { CATEGORY_ICON } from "#lib/components/icon/icon-maps.js";
  import { categoryColor, type CategoryKey } from "#lib/data/categories.js";

  import type { IconProps } from "#lib/components/icon/icon-maps.js";

  interface Props extends IconProps {
    category: "all" | "complete" | CategoryKey;
    useCategoryColor?: true;
  }

  let { category, useCategoryColor, ...rest }: Props = $props();

  const { color } = $derived.by(() => {
    if (category === "all") return { color: "muted-foreground" };
    if (category === "complete") return { color: "yellow-700" };
    return { color: categoryColor(category) };
  });

  const IconComp = $derived(CATEGORY_ICON[category]);
</script>

<IconComp {...rest} color={useCategoryColor ? `var(--${color})` : undefined} />
