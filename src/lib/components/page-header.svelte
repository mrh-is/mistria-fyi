<script lang="ts">
  import IconArrowLeft from "@tabler/icons-svelte-runes/icons/arrow-left";

  import { Icon } from "#lib/components/icon/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  import type { Snippet } from "svelte";

  import type { CategoryKey } from "#lib/data/categories.js";
  import type { CategoryProgress } from "#lib/engine/progress.js";
  import type { Path } from "$app/types";

  let {
    backHref = "",
    backLabel = m.page_header_back_to_home(),
    category,
    historyBack = false,
    icon,
    progress,
    ref = $bindable<HTMLElement | undefined>(undefined),
    title,
  }: {
    backHref?: Path;
    backLabel?: string;
    category?: CategoryKey;
    /** Steps back through browser history when there is any, instead of following `backHref`. */
    historyBack?: boolean;
    icon?: Snippet<[string]>;
    progress?: CategoryProgress;
    ref?: HTMLElement | undefined;
    title: string;
  } = $props();

  const pct = $derived(
    progress !== undefined && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : undefined,
  );

  function goBack(event: MouseEvent): void {
    if (history.length <= 1) return;
    event.preventDefault();
    history.back();
  }
</script>

<header
  bind:this={ref}
  class="page-header"
  class:page-header--category={category !== undefined}
  class:page-header--complete={pct === 100}
  data-page-header={category === undefined ? "generic" : "category"}
  style={category !== undefined && pct !== undefined
    ? `--category-progress-percent: ${pct}%;`
    : undefined}
>
  <a
    class="page-header__back"
    href={localizedHref(backHref)}
    aria-label={backLabel}
    onclick={historyBack ? goBack : undefined}
  >
    <IconArrowLeft class="size-5" />
  </a>
  {#if category === undefined}
    {@render icon?.("size-5")}
  {/if}
  <h1 class="page-header__title" data-testid="page-header-title">{title}</h1>
  {#if pct !== undefined && progress !== undefined}
    <span class="page-header__count">
      <span class="sr-only" aria-live="polite"
        >{m.page_header_progress({
          completed: formatNumber(progress.completed, page.data.locale),
          total: formatNumber(progress.total, page.data.locale),
        })}</span
      >
      <span aria-hidden="true"
        >{formatNumber(progress.completed, page.data.locale)} / {formatNumber(
          progress.total,
          page.data.locale,
        )}</span
      >
    </span>
  {/if}
  {#if category !== undefined}
    <span class="page-header__ribbon" data-page-header-ribbon aria-hidden="true"
      ><Icon.Category {category} class="page-header__icon" /></span
    >

    <span class="page-header__edge-mask" aria-hidden="true"></span>
    <span class="page-header__progress" aria-hidden="true"><i></i></span>
  {/if}
</header>

<style>
  .page-header {
    position: sticky;
    top: 0;
    z-index: var(--z-page-header);
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
    padding: max(16px, env(safe-area-inset-top)) 16px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-ink-hairline) 50%, transparent);
    background: var(--color-paper);
  }

  .page-header--category {
    isolation: isolate;
    min-height: 62px;
    padding-right: 69px;
    border-bottom: 0;
    background: var(--color-paper-raised);
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
    color: var(--color-ink-muted);
  }

  .page-header__back:is(:hover, :focus-visible) {
    color: var(--color-ink);
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
    color: var(--color-ink-muted);
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
    width: var(--size-ribbon-width);
    color: var(--color-ribbon-foreground);
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
      linear-gradient(
          to bottom right,
          transparent 46%,
          var(--color-ribbon-fill) 48% 57%,
          transparent 59%
        )
        top / 9px 50% no-repeat,
      linear-gradient(
          to top right,
          transparent 46%,
          var(--color-ribbon-fill) 48% 57%,
          transparent 59%
        )
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
    width: var(--category-progress-percent);
    height: 100%;
    background: var(--primary);
    transition: width 300ms ease-out;
  }

  /* Ribbons hang in the gutter beside the column; landscape phones have no gutter (app.css). */
  @media (min-width: 701px) and (min-height: 501px) {
    .page-header--category {
      padding-right: 16px;
    }

    .page-header__ribbon {
      right: calc(-1 * var(--size-ribbon-width));
      width: var(--size-ribbon-width);
      padding-left: 0;
      clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 50%, 100% 100%, 0 100%);
    }

    .page-header__edge-mask {
      position: absolute;
      inset: 0 0 0 auto;
      z-index: 1;
      display: block;
      width: 8px;
      background: var(--color-paper-raised);
    }

    .page-header--complete .page-header__ribbon::after {
      right: 0;
      left: auto;
      background:
        linear-gradient(
            to bottom left,
            transparent 46%,
            var(--color-ribbon-fill) 48% 57%,
            transparent 59%
          )
          top / 9px 50% no-repeat,
        linear-gradient(
            to top left,
            transparent 46%,
            var(--color-ribbon-fill) 48% 57%,
            transparent 59%
          )
          bottom / 9px 50% no-repeat;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page-header__progress i {
      transition-duration: 0.01ms;
    }
  }
</style>
