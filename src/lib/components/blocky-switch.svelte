<script lang="ts">
  import { Switch } from "$lib/components/ui/switch/index.js";

  import type { Component, Snippet } from "svelte";

  let {
    checked = $bindable(false),
    checkedIcon,
    children,
    onCheckedChange,
    uncheckedIcon,
  }: {
    checked?: boolean;
    checkedIcon?: Component<{ class?: string }>;
    children?: Snippet;
    onCheckedChange?: (checked: boolean) => void;
    uncheckedIcon?: Component<{ class?: string }>;
  } = $props();

  let thumbIcon = $derived(checked ? checkedIcon : uncheckedIcon);
</script>

<label class="flex cursor-pointer items-center gap-3 text-sm">
  <Switch
    class="h-5 w-9 rounded-md px-px *:data-[slot=switch-thumb]:size-4 *:data-[slot=switch-thumb]:rounded-sm data-[state=checked]:bg-primary *:data-[slot=switch-thumb]:data-[state=checked]:translate-x-full data-[state=unchecked]:bg-input"
    bind:checked
    {onCheckedChange}
    {thumbIcon}
  />
  {@render children?.()}
</label>
