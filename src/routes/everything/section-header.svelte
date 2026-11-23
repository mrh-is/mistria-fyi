<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import { categoryForKey } from "#lib/data/categories.js";
  import { formatNumber } from "#lib/utils/format.js";

  import GroupSection from "./group-section.svelte";

  import type { Snippet } from "svelte";

  import type { CategoryKey } from "#lib/engine/categories.js";
  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { LocaleCode } from "#lib/types/locale.js";

  let {
    children,
    completed = false,
    key,
    locale,
    progress,
    visible = true,
  }: {
    children: Snippet;
    completed?: boolean;
    key: CategoryKey;
    locale: LocaleCode;
    progress: CategoryProgress;
    visible?: boolean;
  } = $props();

  const { color, name } = $derived(categoryForKey(key, locale));
</script>

<GroupSection
  id="category-{key}{completed ? '-completed' : ''}"
  {name}
  description={`${name}, ${formatNumber(progress.completed, locale)} of ${formatNumber(progress.total, locale)} completed`}
  {completed}
  {visible}
  {children}
>
  {#snippet icon()}<Icon.Category category={key} class="size-4" style="color: {color}" />{/snippet}
  {#snippet count()}
    <span class="font-data text-sm font-normal text-muted-foreground" aria-hidden="true"
      >{formatNumber(progress.completed, locale)}/{formatNumber(progress.total, locale)}</span
    >
  {/snippet}
</GroupSection>
