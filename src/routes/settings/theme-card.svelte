<script lang="ts">
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { theme, type Theme } from "$lib/stores/theme.svelte.js";

  import SettingsCard from "./settings-card.svelte";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let preferenceLabel = $derived(
    theme.preference === "system" ? "System" : theme.preference === "light" ? "Light" : "Dark",
  );
</script>

<SettingsCard bind:open title="Theme" summary="Current preference: {preferenceLabel}">
  <ToggleGroup.Root
    class="w-full rounded-md border border-input"
    type="single"
    value={theme.preference}
    onValueChange={(v) => {
      if (v) theme.set(v as Theme);
    }}
  >
    <ToggleGroup.Item class="flex-1" value="system">System</ToggleGroup.Item>
    <ToggleGroup.Item class="flex-1" value="light">Light</ToggleGroup.Item>
    <ToggleGroup.Item class="flex-1" value="dark">Dark</ToggleGroup.Item>
  </ToggleGroup.Root>
</SettingsCard>
