<script lang="ts">
  export type SpriteSlotState = "complete" | "ready" | "spoilered";

  let {
    class: className = "",
    sprite,
    spriteClass = "text-primary",
    state: slotState,
  }: {
    class?: string;
    sprite: string;
    spriteClass?: string;
    state: SpriteSlotState;
  } = $props();

  const instanceId = $props.id();
  const grayFilterId = `${instanceId}-sprite-gray`;
  const tintFilterId = `${instanceId}-sprite-tint`;

  let imageFailed = $state(false);
  let source = $derived(`/sprites/${sprite}.webp`);

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
        <feFlood flood-color="var(--ink-muted)" result="gray" />
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
          x="0"
          y="0"
          width="18"
          height="18"
          filter="url(#{tintFilterId})"
          onerror={handleImageError}
          style="image-rendering: pixelated;"
        />
      {:else if slotState === "spoilered"}
        <image
          data-sprite-layer="silhouette"
          href={source}
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
          x="0"
          y="0"
          width="18"
          height="18"
          onerror={handleImageError}
          style="filter: drop-shadow(0.8px 1.2px 0.7px rgb(46 42 34 / 35%)); image-rendering: pixelated; transform: rotate(2.5deg); transform-box: fill-box; transform-origin: center;"
        />
      {/if}
    {:else}
      <path
        d="M9 3.5 14.5 9 9 14.5 3.5 9Z"
        fill="none"
        stroke="var(--ink-muted)"
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
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border: 1.5px dashed var(--hairline);
    border-radius: 3px;
    opacity: 0.4;
  }

  .sprite-slot--active {
    border-color: currentColor;
    opacity: 1;
  }

  .sprite-slot--complete {
    border-style: solid;
    border-color: var(--hairline);
    opacity: 1;
  }

  .sprite-slot__svg {
    width: 36px;
    height: 36px;
  }
</style>
