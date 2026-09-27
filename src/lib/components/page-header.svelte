<script lang="ts">
  import { IconArrowLeft } from "@tabler/icons-svelte-runes";

  import { Icon } from "$lib/components/icon/index.js";
  import * as m from "$lib/paraglide/messages.js";
  import { getLocale } from "$lib/paraglide/runtime.js";
  import { formatNumber } from "$lib/utils/format.js";
  import { localizedHref } from "$lib/utils/localized-href.js";

  import type { Snippet } from "svelte";

  import type { Pathname } from "$app/types";
  import type { CategoryKey } from "$lib/data/categories.js";
  import type { CategoryProgress } from "$lib/engine/progress.js";

  let {
    backHref = "/",
    backLabel = m.page_header_back_to_home(),
    category,
    icon,
    onback,
    progress,
    ref = $bindable<HTMLElement | undefined>(undefined),
    title,
  }: {
    backHref?: Pathname;
    backLabel?: string;
    category?: CategoryKey;
    icon?: Snippet<[string]>;
    onback?: (event: MouseEvent) => void;
    progress?: CategoryProgress;
    ref?: HTMLElement | undefined;
    title: string;
  } = $props();

  const pct = $derived(
    progress !== undefined && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : undefined,
  );
</script>

<header
  bind:this={ref}
  class="page-header"
  class:page-header--category={category !== undefined}
  class:page-header--complete={pct === 100}
  data-page-header={category === undefined ? "generic" : "category"}
  style={category !== undefined && pct !== undefined ? `--category-progress: ${pct}%;` : undefined}
>
  <a
    class="page-header__back"
    href={localizedHref(backHref)}
    aria-label={backLabel}
    onclick={onback}
  >
    <IconArrowLeft class="size-5" />
  </a>
  {#if category === undefined}
    {@render icon?.("size-5")}
  {/if}
  <h1 class="page-header__title">{title}</h1>
  {#if pct !== undefined && progress !== undefined}
    <span class="page-header__count">
      <span class="sr-only" aria-live="polite"
        >{m.page_header_progress({
          completed: formatNumber(progress.completed, getLocale()),
          total: formatNumber(progress.total, getLocale()),
        })}</span
      >
      <span aria-hidden="true"
        >{formatNumber(progress.completed, getLocale())} / {formatNumber(
          progress.total,
          getLocale(),
        )}</span
      >
    </span>
  {/if}
  {#if category !== undefined}
    <span class="page-header__ribbon" data-page-header-ribbon aria-hidden="true">
      <Icon.Category {category} class="page-header__icon" />
    </span>
    <span class="page-header__edge-mask" aria-hidden="true"></span>
    <span class="page-header__progress" aria-hidden="true"><i></i></span>
  {/if}
</header>

<style>
  .page-header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    padding: max(16px, env(safe-area-inset-top)) 16px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--hairline) 50%, transparent);
    background: var(--paper);
  }

  .page-header--category {
    --header-ribbon-width: 49px;
    isolation: isolate;
    min-height: 62px;
    padding-right: 69px;
    border-bottom: 0;
    background: var(--paper-raised);
    box-shadow: var(--shadow-small);
  }

  .page-header__back {
    position: relative;
    z-index: 2;
    display: flex;
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    margin-left: -12px;
    color: var(--ink-muted);
  }

  .page-header__back:is(:hover, :focus-visible) {
    color: var(--ink);
    outline: 2px solid var(--primary);
    outline-offset: -6px;
  }

  .page-header__title {
    position: relative;
    z-index: 2;
    min-width: 0;
    flex: 1;
    margin: -0.35em 0 -0.35em -0.06em;
    overflow: hidden;
    padding: 0.35em 0 0.35em 0.06em;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-style: var(--font-display-style);
    font-weight: 400;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .page-header__count {
    position: relative;
    z-index: 2;
    flex-shrink: 0;
    color: var(--ink-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .page-header__ribbon {
    position: absolute;
    top: 7px;
    right: 0;
    bottom: 7px;
    z-index: 0;
    display: grid;
    place-items: center;
    width: var(--header-ribbon-width);
    color: var(--ribbon-ink);
    background: var(--primary);
    clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%);
  }

  .page-header__ribbon :global(.page-header__icon) {
    width: 24px;
    height: 24px;
  }

  .page-header--complete .page-header__ribbon::after {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 9px;
    background:
      linear-gradient(to bottom right, transparent 46%, var(--ribbon-gold) 48% 57%, transparent 59%)
        top / 9px 50% no-repeat,
      linear-gradient(to top right, transparent 46%, var(--ribbon-gold) 48% 57%, transparent 59%)
        bottom / 9px 50% no-repeat;
    content: "";
  }

  .page-header__edge-mask {
    display: none;
  }

  .page-header__progress {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 2;
    height: 3px;
    background: color-mix(in srgb, var(--primary) 13%, transparent);
  }

  .page-header__progress i {
    display: block;
    width: var(--category-progress);
    height: 100%;
    background: var(--primary);
    transition: width 300ms ease-out;
  }

  @media (min-width: 701px) {
    .page-header--category {
      padding-right: 16px;
    }

    .page-header__ribbon {
      right: calc(-1 * var(--header-ribbon-width));
      width: var(--header-ribbon-width);
      padding-left: 0;
      clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 50%, 100% 100%, 0 100%);
    }

    .page-header__edge-mask {
      position: absolute;
      inset: 0 0 0 auto;
      z-index: 1;
      display: block;
      width: 8px;
      background: var(--paper-raised);
    }

    .page-header--complete .page-header__ribbon::after {
      right: 0;
      left: auto;
      background:
        linear-gradient(
            to bottom left,
            transparent 46%,
            var(--ribbon-gold) 48% 57%,
            transparent 59%
          )
          top / 9px 50% no-repeat,
        linear-gradient(to top left, transparent 46%, var(--ribbon-gold) 48% 57%, transparent 59%)
          bottom / 9px 50% no-repeat;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page-header__progress i {
      transition-duration: 0.01ms;
    }
  }
</style>
