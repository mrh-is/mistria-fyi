<script lang="ts">
  import { prefersReducedMotion } from "svelte/motion";
  import { fade } from "svelte/transition";

  import { itemSpriteUrl } from "#lib/sprites/sprite-url.js";
  import { SPRITE_PREVIEW_FADE_MS } from "#lib/utils/row-timing.js";

  export type SpriteSlotState = "complete" | "ready" | "spoilered";

  let {
    class: className = "",
    previewing = false,
    sprite,
    spriteClass = "text-primary",
    state: slotState,
  }: {
    class?: string;
    /** Overlays the full-color sprite on a ready silhouette. */
    previewing?: boolean;
    sprite: string;
    spriteClass?: string;
    state: SpriteSlotState;
  } = $props();

  const instanceId = $props.id();
  const grayFilterId = `${instanceId}-sprite-gray`;
  const tintFilterId = `${instanceId}-sprite-tint`;

  let imageFailed = $state(false);
  let source = $derived(itemSpriteUrl(sprite));

  function handleImageError(): void {
    imageFailed = true;
  }
</script>

<span
  class="sprite-slot {className}"
  class:sprite-slot--active={slotState === "ready"}
  class:sprite-slot--complete={slotState === "complete"}
  data-sprite-slot={slotState}
  aria-hidden="true"
>
  <svg class="sprite-slot__svg {spriteClass}" viewBox="0 0 18 18" role="presentation">
    <defs>
      <filter id={grayFilterId} color-interpolation-filters="sRGB">
        <feFlood flood-color="var(--color-ink-muted)" result="gray" />
        <feComposite in="gray" in2="SourceAlpha" operator="in" />
      </filter>

      <filter id={tintFilterId} color-interpolation-filters="sRGB">
        <!-- Lighter fill: erode slightly to create the inner shape -->
        <feMorphology in="SourceAlpha" operator="erode" radius="0.15" result="innerShape" />
        <!-- Darker outline: difference between full alpha and eroded shape -->
        <feComposite in="SourceAlpha" in2="innerShape" operator="out" result="outline" />
        <!-- Fill the inner shape with a lighter version of the category color -->
        <feFlood flood-color="currentColor" flood-opacity="0.25" result="lightFill" />
        <feComposite in="lightFill" in2="innerShape" operator="in" result="filledInner" />
        <!-- Fill the outline with the full category color -->
        <feFlood flood-color="currentColor" result="darkFill" />
        <feComposite in="darkFill" in2="outline" operator="in" result="filledOutline" />
        <!-- Combine both layers -->
        <feMerge>
          <feMergeNode in="filledInner" />
          <feMergeNode in="filledOutline" />
        </feMerge>
      </filter>
    </defs>

    {#if !imageFailed}
      {#if slotState === "ready"}
        <image
          data-sprite-layer="silhouette"
          href={source}
          crossorigin="anonymous"
          x="0"
          y="0"
          width="18"
          height="18"
          filter="url(#{tintFilterId})"
          onerror={handleImageError}
          style="image-rendering: pixelated;"
        />
        {#if previewing}
          <!-- Same alpha as the silhouette, so the full-color sprite covers it exactly -->
          <image
            data-sprite-layer="preview"
            href={source}
            crossorigin="anonymous"
            x="0"
            y="0"
            width="18"
            height="18"
            onerror={handleImageError}
            style="image-rendering: pixelated;"
            transition:fade={{
              duration: prefersReducedMotion.current ? 0 : SPRITE_PREVIEW_FADE_MS,
            }}
          />
        {/if}
      {:else if slotState === "spoilered"}
        <image
          data-sprite-layer="silhouette"
          href={source}
          crossorigin="anonymous"
          x="0"
          y="0"
          width="18"
          height="18"
          filter="url(#{grayFilterId})"
          opacity="0.2"
          onerror={handleImageError}
          style="image-rendering: pixelated;"
        />
      {:else}
        <!-- Complete: gray silhouette underneath -->
        <image
          data-sprite-layer="silhouette"
          href={source}
          crossorigin="anonymous"
          x="0"
          y="0"
          width="18"
          height="18"
          filter="url(#{grayFilterId})"
          opacity="0.2"
          onerror={handleImageError}
          style="image-rendering: pixelated;"
        />
        <!-- Full-color sticker on top -->
        <image
          data-sprite-layer="sticker"
          href={source}
          crossorigin="anonymous"
          x="0"
          y="0"
          width="18"
          height="18"
          onerror={handleImageError}
          style="filter: drop-shadow(var(--shadow-sticker)); image-rendering: pixelated; transform: rotate(2.5deg); transform-box: fill-box; transform-origin: center;"
        />
      {/if}
    {:else}
      <path
        d="M9 3.5 14.5 9 9 14.5 3.5 9Z"
        fill="none"
        stroke="var(--color-ink-muted)"
        stroke-width="0.75"
        stroke-dasharray="1.5 1.5"
        opacity="0.3"
      />
    {/if}
  </svg>
</span>

<style>
  .sprite-slot {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--tracker-sprite-size, 40px);
    height: var(--tracker-sprite-size, 40px);
    flex-shrink: 0;
    border: 1px dashed var(--color-sprite-slot-outline);
    border-radius: var(--radius);
    opacity: 0.32;
  }

  .sprite-slot--active {
    opacity: 1;
  }

  .sprite-slot--complete {
    border-style: solid;
    border-color: var(--color-sprite-slot-outline);
    opacity: 1;
  }

  .sprite-slot__svg {
    width: calc(var(--tracker-sprite-size, 40px) - 6px);
    height: calc(var(--tracker-sprite-size, 40px) - 6px);
  }
</style>
