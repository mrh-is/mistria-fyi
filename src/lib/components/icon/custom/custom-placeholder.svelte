<script lang="ts">
  import type { IconProps } from "#lib/components/icon/icon-maps.js";

  let { color = "currentColor", size = 24, stroke = 2, ...rest }: IconProps = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  {...rest}
>
  <circle cx="12" cy="12" r="10" />
  <line x1="12" y1="8" x2="12" y2="12" />
  <line x1="12" y1="16" x2="12.01" y2="16" />
</svg>
