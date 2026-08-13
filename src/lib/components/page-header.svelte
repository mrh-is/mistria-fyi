<script lang="ts">
  import { ArrowLeft } from "@lucide/svelte";

  import { resolve } from "$app/paths";

  import type { Snippet } from "svelte";

  import type { Pathname } from "$app/types";
  import type { CategoryProgress } from "$lib/engine/progress.js";

  let {
    backHref = "/",
    backLabel = "Back to home",
    icon,
    progress,
    ref = $bindable<HTMLDivElement | undefined>(undefined),
    title,
  }: {
    backHref?: Pathname;
    backLabel?: string;
    icon?: Snippet<[string]>;
    progress?: CategoryProgress;
    ref?: HTMLDivElement | undefined;
    title: string;
  } = $props();

  const pct = $derived(
    progress !== undefined && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : undefined,
  );
</script>

<div
  bind:this={ref}
  class="sticky top-0 z-10 -mx-4 flex items-center gap-2 border-b border-border/50 bg-background px-4 pt-safe-or-4 pb-3"
>
  <a
    class="-ml-3 flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-foreground"
    href={resolve(backHref)}
    aria-label={backLabel}
  >
    <ArrowLeft class="size-5" />
  </a>
  {@render icon?.("size-5")}
  <h1 class="flex-1 text-xl font-semibold">{title}</h1>
  {#if pct !== undefined && progress !== undefined}
    <span class="shrink-0 text-sm text-muted-foreground">
      <span class="sm:hidden">{pct}%</span>
      <span class="hidden sm:inline">{progress.completed}/{progress.total}</span>
    </span>
  {/if}
</div>
