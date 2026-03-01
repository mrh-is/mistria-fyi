<script lang="ts">
  import { Switch as SwitchPrimitive } from "bits-ui";
  import type { Component } from "svelte";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    checked = $bindable(false),
    thumbIcon,
    ...restProps
  }: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & {
    thumbIcon?: Component<{ class?: string }>;
  } = $props();
</script>

<SwitchPrimitive.Root
  bind:ref
  bind:checked
  data-slot="switch"
  class={cn(
    "peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
    className,
  )}
  {...restProps}
>
  <SwitchPrimitive.Thumb
    data-slot="switch-thumb"
    class={cn(
      "pointer-events-none flex size-4 items-center justify-center rounded-full bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground",
    )}
  >
    {#if thumbIcon}
      {@const Icon = thumbIcon}
      <Icon class="size-3 text-muted-foreground" />
    {/if}
  </SwitchPrimitive.Thumb>
</SwitchPrimitive.Root>
