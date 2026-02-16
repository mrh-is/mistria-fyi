<script lang="ts">
  import { Progress as ProgressPrimitive } from "bits-ui";

  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

  let {
    class: className,
    color = "primary",
    max = 100,
    ref = $bindable(null),
    value,
    ...restProps
  }: WithoutChildrenOrChild<ProgressPrimitive.RootProps> = $props();
</script>

<ProgressPrimitive.Root
  bind:ref
  data-slot="progress"
  style={{ "--progress-color": `var(--${color})` }}
  class={cn("relative h-2 w-full overflow-hidden rounded-full bg-(--progress-color)/20", className)}
  {value}
  {max}
  {...restProps}
>
  <div
    data-slot="progress-indicator"
    class="h-full w-full flex-1 bg-(--progress-color) transition-transform duration-300 ease-out"
    style="transform: translateX(-{100 - (100 * (value ?? 0)) / (max ?? 1)}%)"
  ></div>
</ProgressPrimitive.Root>
