<script lang="ts">
  import { Icon } from "$lib/components/icon/index.js";
  import { categoryForKey, type CategoryKey } from "$lib/data/categories.js";
  import { localizedHref } from "$lib/utils/localized-href.js";

  import type { CategoryProgress } from "$lib/engine/progress.js";
  import type { LocaleCode } from "$lib/types/locale.js";

  interface DisplayCategory {
    color: string;
    description: string;
    href: "/";
    icon: "all" | CategoryKey;
    name: string;
  }

  let {
    displayCategory,
    displayCompleted,
    key,
    locale,
    mobileRibbon = false,
    progress,
  }: {
    displayCategory?: DisplayCategory;
    displayCompleted?: string;
    key: CategoryKey;
    locale: LocaleCode;
    mobileRibbon?: boolean;
    progress: CategoryProgress;
  } = $props();

  const { color, description, href, icon, name } = $derived(
    displayCategory ?? { ...categoryForKey(key, locale), icon: key },
  );

  // Show available count when filtering is active (filtered < total - completed)
  let displayTotal = $derived(progress.completed + progress.filtered);
  let pct = $derived(displayTotal > 0 ? (progress.completed / displayTotal) * 100 : 0);
  let isComplete = $derived(progress.total > 0 && progress.completed >= progress.total);
</script>

<a
  class="category-stripe"
  class:category-stripe--complete={isComplete}
  class:category-stripe--mobile-ribbon={mobileRibbon}
  data-category-stripe
  href={localizedHref(href)}
  aria-label="{name}, {progress.completed} of {displayTotal} completed"
  style="--category-color: var(--{color}); --category-progress: {pct}%"
>
  <span class="category-copy">
    <strong class="category-name">{name}</strong>
    <span class="category-note">{description}</span>
  </span>

  <span class="category-count" aria-hidden="true">
    <span>{displayCompleted ?? progress.completed.toLocaleString()}</span>
    <span class="category-slash">/</span>
    <span>{displayTotal.toLocaleString()}</span>
  </span>

  <span class="category-ribbon" data-category-ribbon aria-hidden="true">
    <Icon.Category category={icon} class="category-icon" />
  </span>
  <span class="paper-edge-mask" aria-hidden="true"></span>
  <span class="category-progress" aria-hidden="true"><i></i></span>
</a>

<style>
  .category-stripe {
    --ribbon-width: 49px;
    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 58px;
    padding: 6px 69px 6px 23px;
    overflow: visible;
    color: var(--ink);
    background: var(--paper-raised);
    box-shadow: var(--shadow-small);
    text-align: left;
    transition:
      box-shadow 180ms cubic-bezier(0.2, 0.7, 0.2, 1),
      transform 180ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  .category-copy,
  .category-count,
  .category-progress {
    position: relative;
    z-index: 2;
  }

  .category-copy {
    min-width: 0;
  }

  .category-name {
    position: relative;
    isolation: isolate;
    display: block;
    width: fit-content;
    font-size: 16px;
    font-weight: 600;
    line-height: 1.2;
    -webkit-text-stroke: 1.35px var(--paper-raised);
    paint-order: stroke fill;
  }

  .category-name::after {
    position: absolute;
    right: -8px;
    bottom: 0;
    left: -5px;
    z-index: -1;
    height: 48%;
    background: color-mix(in srgb, var(--category-color) 20%, transparent);
    content: "";
    transform: rotate(-0.7deg);
  }

  :global(li:nth-child(even)) .category-name::after {
    transform: rotate(0.7deg);
  }

  .category-note {
    display: block;
    overflow: hidden;
    margin-top: 2px;
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: 11px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .category-count {
    display: grid;
    grid-template-columns: 4ch auto 4ch;
    column-gap: 0.45ch;
    align-items: baseline;
    font-family: var(--font-data);
    font-size: 12px;
    white-space: nowrap;
  }

  .category-count > :first-child {
    text-align: right;
  }

  .category-count > :last-child {
    text-align: left;
  }

  .category-slash {
    color: var(--category-color);
    text-align: center;
  }

  .category-ribbon {
    position: absolute;
    top: 5px;
    right: -8px;
    bottom: 5px;
    z-index: 0;
    display: grid;
    place-items: center;
    width: calc(var(--ribbon-width) + 8px);
    padding-left: 8px;
    color: var(--ribbon-ink);
    background: var(--category-color);
    clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%);
    transition:
      filter 180ms cubic-bezier(0.2, 0.7, 0.2, 1),
      transform 180ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  .category-ribbon :global(.category-icon) {
    width: 22px;
    height: 22px;
    transition: transform 180ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  .paper-edge-mask {
    display: none;
  }

  .category-progress {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 2px;
    background: color-mix(in srgb, var(--category-color) 13%, transparent);
  }

  .category-progress i {
    display: block;
    width: var(--category-progress);
    height: 100%;
    background: var(--category-color);
    transition: width 300ms ease-out;
  }

  .category-stripe--complete {
    background: color-mix(in srgb, var(--paper-raised) 96%, var(--fg-amber));
  }

  .category-stripe--complete .category-ribbon::after {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 9px;
    background:
      linear-gradient(to bottom right, transparent 46%, #d4a72c 48% 57%, transparent 59%) top / 9px
        50% no-repeat,
      linear-gradient(to top right, transparent 46%, #d4a72c 48% 57%, transparent 59%) bottom / 9px
        50% no-repeat;
    content: "";
  }

  .category-stripe:is(:hover, :focus-visible) {
    z-index: 3;
    box-shadow: 0 3px 8px rgb(46 42 34 / 16%);
    outline: 2px solid var(--category-color);
    outline-offset: 2px;
    transform: translateY(-1px);
  }

  .category-stripe:is(:hover, :focus-visible) .category-ribbon {
    filter: drop-shadow(0 3px 2px rgb(46 42 34 / 30%));
    transform: translateX(-3px);
  }

  .category-stripe:is(:hover, :focus-visible) .category-ribbon :global(.category-icon) {
    transform: rotate(-4deg);
  }

  @media (min-width: 701px) {
    .category-stripe {
      min-height: 60px;
      padding-right: 20px;
    }

    .category-ribbon {
      right: calc(-1 * var(--ribbon-width));
      width: var(--ribbon-width);
      padding-left: 0;
      clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 50%, 100% 100%, 0 100%);
    }

    .paper-edge-mask {
      position: absolute;
      inset: 0 0 0 auto;
      z-index: 1;
      display: block;
      width: 8px;
      background: inherit;
    }

    .category-stripe:is(:hover, :focus-visible) .category-ribbon {
      transform: translateX(3px);
    }

    .category-stripe--complete .category-ribbon::after {
      right: 0;
      left: auto;
      background:
        linear-gradient(to bottom left, transparent 46%, #d4a72c 48% 57%, transparent 59%) top / 9px
          50% no-repeat,
        linear-gradient(to top left, transparent 46%, #d4a72c 48% 57%, transparent 59%) bottom / 9px
          50% no-repeat;
    }
  }

  .category-stripe--mobile-ribbon {
    padding-right: 69px;
  }

  .category-stripe--mobile-ribbon .category-ribbon {
    right: -8px;
    width: calc(var(--ribbon-width) + 8px);
    padding-left: 8px;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 8px 50%);
  }

  .category-stripe--mobile-ribbon .paper-edge-mask {
    display: none;
  }

  @media (hover: hover) and (prefers-reduced-motion: no-preference) {
    .category-stripe--complete:is(:hover, :focus-visible) .category-ribbon::after {
      animation: gold-leaf-glint 650ms ease-out;
    }
  }

  @keyframes gold-leaf-glint {
    0%,
    100% {
      filter: brightness(1);
    }
    45% {
      filter: brightness(1.65);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .category-stripe,
    .category-ribbon,
    .category-ribbon :global(.category-icon),
    .category-progress i {
      transition-duration: 0.01ms;
    }

    .category-stripe:is(:hover, :focus-visible),
    .category-stripe:is(:hover, :focus-visible) .category-ribbon,
    .category-stripe:is(:hover, :focus-visible) .category-ribbon :global(.category-icon) {
      transform: none;
    }
  }
</style>
