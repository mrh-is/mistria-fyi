<script lang="ts">
  import { Switch } from "$lib/components/ui/switch/index.js";

  import type { Component, Snippet } from "svelte";

  let {
    checked = $bindable(false),
    checkedIcon,
    children,
    label,
    onCheckedChange,
    uncheckedIcon,
  }: {
    checked?: boolean;
    checkedIcon?: Component<{ class?: string }>;
    children?: Snippet;
    label?: string;
    onCheckedChange?: (checked: boolean) => void;
    uncheckedIcon?: Component<{ class?: string }>;
  } = $props();

  let thumbIcon = $derived(checked ? checkedIcon : uncheckedIcon);
</script>

<label class="flex cursor-pointer items-center gap-3 text-sm">
  <Switch
    class="blocky-switch h-[34px] w-[58px] rounded-none border px-px *:data-[slot=switch-thumb]:size-7 *:data-[slot=switch-thumb]:rounded-none *:data-[slot=switch-thumb]:data-[state=checked]:translate-x-7"
    bind:checked
    aria-label={label}
    {onCheckedChange}
    {thumbIcon}
  />
  {@render children?.()}
</label>

<style>
  :global(.blocky-switch[data-state="unchecked"]) {
    border-color: color-mix(in srgb, var(--hairline) 34%, transparent);
    background: var(--paper-deep);
  }

  :global(.blocky-switch[data-state="checked"]) {
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, var(--paper-raised));
  }

  :global(.blocky-switch [data-slot="switch-thumb"]) {
    background: var(--ink-muted);
  }

  :global(.blocky-switch[data-state="checked"] [data-slot="switch-thumb"]) {
    background: var(--primary);
  }
</style>
