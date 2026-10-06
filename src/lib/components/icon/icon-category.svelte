<script lang="ts">
  import { CATEGORY_ICON } from "#lib/components/icon/icon-maps.js";
  import { categoryColor } from "#lib/data/categories.js";

  import type { IconProps } from "#lib/components/icon/icon-maps.js";
  import type { CategoryKey } from "#lib/data/categories.js";

  interface Props extends IconProps {
    category: "all" | "complete" | CategoryKey;
    useCategoryColor?: true;
  }

  let { category, useCategoryColor, ...rest }: Props = $props();

  const color = $derived.by(() => {
    if (category === "all") return "var(--muted-foreground)";
    if (category === "complete") return "var(--color-progress-complete)";
    return categoryColor(category);
  });

  const IconComp = $derived(CATEGORY_ICON[category]);
</script>

<IconComp {...rest} color={useCategoryColor ? color : undefined} />
