<script lang="ts">
  export type ItemSpriteState = "complete" | "ready" | "spoilered";

  let {
    class: className = "",
    sprite,
    state: spriteState,
  }: {
    class?: string;
    sprite: string;
    state: ItemSpriteState;
  } = $props();

  const instanceId = $props.id();
  const grayFilterId = `${instanceId}-sprite-gray`;
  const spotFilterId = `${instanceId}-sprite-spot`;
  const tintFilterId = `${instanceId}-sprite-tint`;

  let imageFailed = $state(false);
  let source = $derived(`/sprites/${sprite}.webp`);

  function handleImageError(): void {
    imageFailed = true;
  }
</script>

<span
  class="relative inline-block size-11 shrink-0 {className}"
  data-item-sprite={spriteState}
  aria-hidden="true"
>
  <svg class="size-full overflow-visible" viewBox="-3 -3 24 24" role="presentation">
    <defs>
      <filter
        id={spotFilterId}
        x="-25%"
        y="-25%"
        width="150%"
        height="150%"
        color-interpolation-filters="sRGB"
      >
        <feMorphology in="SourceAlpha" operator="dilate" radius="0.7" result="expanded" />
        <feMorphology in="SourceAlpha" operator="erode" radius="0.15" result="contracted" />
        <feComposite in="expanded" in2="contracted" operator="out" result="outline" />
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves="1"
          seed="7"
          result="dashes"
        />
        <feColorMatrix in="dashes" type="luminanceToAlpha" result="dashAlpha" />
        <feComponentTransfer in="dashAlpha" result="dashMask">
          <feFuncA type="discrete" tableValues="0 0 1 1" />
        </feComponentTransfer>
        <feComposite in="outline" in2="dashMask" operator="in" result="brokenOutline" />
        <feFlood flood-color="var(--ink-muted)" result="spotColor" />
        <feComposite in="spotColor" in2="brokenOutline" operator="in" />
      </filter>

      <filter id={grayFilterId} color-interpolation-filters="sRGB">
        <feFlood flood-color="var(--ink-muted)" result="gray" />
        <feComposite in="gray" in2="SourceAlpha" operator="in" />
      </filter>

      <filter id={tintFilterId} color-interpolation-filters="sRGB">
        <feMorphology in="SourceAlpha" operator="erode" radius="0.15" result="shape" />
        <feFlood flood-color="currentColor" result="categoryColor" />
        <feComposite in="categoryColor" in2="shape" operator="in" />
      </filter>
    </defs>

    {#if !imageFailed}
      <image
        data-sprite-layer="spot"
        data-spot-active={spriteState === "ready"}
        href={source}
        x="0"
        y="0"
        width="18"
        height="18"
        filter="url(#{spotFilterId})"
        opacity={spriteState === "ready" ? 0.65 : 0.3}
        onerror={handleImageError}
        style="image-rendering: pixelated;"
      />

      {#if spriteState === "ready"}
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
      {:else}
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
      {/if}

      {#if spriteState === "complete"}
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
