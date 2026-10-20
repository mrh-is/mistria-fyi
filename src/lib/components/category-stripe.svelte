<script lang="ts">
  import { Icon } from "#lib/components/icon/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { formatNumber } from "#lib/utils/format.js";
  import { localizedHref } from "#lib/utils/localized-href.js";
  import { page } from "$app/state";

  import type { CategoryKey } from "#lib/data/categories.js";
  import type { Path } from "$app/types";

  /**
   * The presentational category stripe: a link with a name, note, count, ribbon icon, and progress
   * rule. `CategoryCard` resolves a tracked category into these props; the share image passes its
   * own.
   */
  let {
    categoryTotal,
    color,
    completed,
    completedLabel,
    description,
    filteredTotal,
    href,
    icon,
    mobileRibbon = false,
    name,
  }: {
    /** Everything in the category, filters aside; reaching it earns the gold-leaf edge. */
    categoryTotal: number;
    color: string;
    completed: number;
    /** Replaces the visible completed count (the share image shows "??"). */
    completedLabel?: string;
    description: string;
    /** The count shown after the slash: what's completed plus what the filters still show. */
    filteredTotal: number;
    href: Path;
    icon: "all" | CategoryKey;
    mobileRibbon?: boolean;
    name: string;
  } = $props();

  let pct = $derived(filteredTotal > 0 ? (completed / filteredTotal) * 100 : 0);
  let isComplete = $derived(categoryTotal > 0 && completed >= categoryTotal);
</script>

<a
  class="category-stripe"
  class:category-stripe--complete={isComplete}
  class:category-stripe--mobile-ribbon={mobileRibbon}
  data-category-stripe
  href={localizedHref(href)}
  aria-label={m.section_progress_label({
    completed: formatNumber(completed, page.data.locale),
    name,
    total: formatNumber(filteredTotal, page.data.locale),
  })}
  style="--category-color: {color}; --category-progress-percent: {pct}%"
>
  <span class="category-copy">
    <strong class="category-name">{name}</strong>
    <span class="category-note">{description}</span>
  </span>

  <span class="category-count" aria-hidden="true">
    <span>{completedLabel ?? formatNumber(completed, page.data.locale)}</span>
    <span class="category-slash">/</span>
    <span>{formatNumber(filteredTotal, page.data.locale)}</span>
  </span>

  <span class="category-ribbon" data-category-ribbon aria-hidden="true">
    <Icon.Category category={icon} class="category-icon" />
  </span>
  <span class="paper-edge-mask" aria-hidden="true"></span>
  <span class="category-progress" aria-hidden="true"><i></i></span>
</a>

<style>
  .category-stripe {
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
    color: var(--color-ink);
    background: var(--color-paper-raised);
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
    font-size: var(--text-base);
    font-weight: 600;
    line-height: 1.2;
    -webkit-text-stroke: 1.35px var(--color-paper-raised);
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
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
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
    font-size: var(--text-xs);
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
    width: calc(var(--size-ribbon-width) + 8px);
    padding-left: 8px;
    color: var(--color-ribbon-foreground);
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
    width: var(--category-progress-percent);
    height: 100%;
    background: var(--category-color);
    transition: width 300ms ease-out;
  }

  .category-stripe--complete {
    background: color-mix(in srgb, var(--color-paper-raised) 96%, var(--color-progress-complete));
  }

  .category-stripe--complete .category-ribbon::after {
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

  .category-stripe:is(:active, :focus-visible) {
    z-index: 3;
    box-shadow: var(--shadow-medium);
    outline: 2px solid var(--category-color);
    outline-offset: 2px;
    transform: translateY(-1px);
  }

  .category-stripe:is(:active, :focus-visible) .category-ribbon {
    filter: drop-shadow(var(--shadow-ribbon));
    transform: translateX(-3px);
  }

  .category-stripe:is(:active, :focus-visible) .category-ribbon :global(.category-icon) {
    transform: rotate(-4deg);
  }

  @media (hover: hover) {
    .category-stripe:hover {
      z-index: 3;
      box-shadow: var(--shadow-medium);
      outline: 2px solid var(--category-color);
      outline-offset: 2px;
      transform: translateY(-1px);
    }

    .category-stripe:hover .category-ribbon {
      filter: drop-shadow(var(--shadow-ribbon));
      transform: translateX(-3px);
    }

    .category-stripe:hover .category-ribbon :global(.category-icon) {
      transform: rotate(-4deg);
    }
  }

  /* Ribbons hang in the gutter beside the column; landscape phones have no gutter (app.css). */
  @media (min-width: 701px) and (min-height: 501px) {
    .category-stripe {
      min-height: 60px;
      padding-right: 20px;
    }

    .category-ribbon {
      right: calc(-1 * var(--size-ribbon-width));
      width: var(--size-ribbon-width);
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

    .category-stripe:is(:active, :focus-visible) .category-ribbon {
      transform: translateX(3px);
    }

    @media (hover: hover) {
      .category-stripe:hover .category-ribbon {
        transform: translateX(3px);
      }
    }

    .category-stripe--complete .category-ribbon::after {
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

  .category-stripe--mobile-ribbon {
    padding-right: 69px;
  }

  .category-stripe--mobile-ribbon .category-ribbon {
    right: -8px;
    width: calc(var(--size-ribbon-width) + 8px);
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

    .category-stripe:is(:hover, :active, :focus-visible),
    .category-stripe:is(:hover, :active, :focus-visible) .category-ribbon,
    .category-stripe:is(:hover, :active, :focus-visible) .category-ribbon :global(.category-icon) {
      transform: none;
    }
  }
</style>
