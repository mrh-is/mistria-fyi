<script lang="ts">
  import { SunMoon } from "@lucide/svelte";

  import { buttonVariants } from "$lib/components/ui/button/index.js";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import { theme, type Theme } from "$lib/stores/theme.svelte.js";

  /* eslint-disable perfectionist/sort-objects */
  const themes: Record<Theme, string> = {
    system: "System",
    light: "Light",
    dark: "Dark",
  };
  /* eslint-enable perfectionist/sort-objects */
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger
    title="Toggle theme"
    class={buttonVariants({ size: "icon", variant: "outline" })}
  >
    <SunMoon class="size-5" />
    <span class="sr-only">Toggle theme</span>
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end">
    <DropdownMenu.RadioGroup
      value={theme.preference}
      onValueChange={(v) => {
        theme.set(v as Theme);
      }}
    >
      {#each Object.entries(themes) as [value, label] (value)}
        <DropdownMenu.RadioItem {value}>
          {label}
        </DropdownMenu.RadioItem>
      {/each}
    </DropdownMenu.RadioGroup>
  </DropdownMenu.Content>
</DropdownMenu.Root>
