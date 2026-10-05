<script lang="ts">
  import IconPalette from "@tabler/icons-svelte-runes/icons/palette";

  import * as ToggleGroup from "#lib/components/ui/toggle-group/index.js";
  import * as m from "#lib/paraglide/messages.js";
  import { theme } from '#lib/stores/theme.svelte.js';
import type { Theme } from '#lib/stores/theme.svelte.js';

  const themeLabels: Record<Theme, string> = {
    dark: m.settings_theme_dark(),
    light: m.settings_theme_light(),
    system: m.settings_theme_auto(),
  };
</script>

<div class="theme-setting">
  <span class="theme-setting__label"
    ><IconPalette class="size-3.5" />{m.settings_theme_label()}</span
  >
  <ToggleGroup.Root
    class="theme-setting__strip"
    type="single"
    value={theme.preference}
    onValueChange={(value) => {
      if (value) theme.set(value as Theme);
    }}
  >
    {#each ["light", "dark", "system"] as const as value (value)}
      <ToggleGroup.Item class="theme-setting__item" {value}>
        {themeLabels[value]}
      </ToggleGroup.Item>
    {/each}
  </ToggleGroup.Root>
</div>

<style>
  .theme-setting {
    display: flex;
    min-height: 52px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--hairline) 24%, transparent);
  }

  .theme-setting__label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  :global(.theme-setting__strip) {
    gap: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--hairline) 42%, transparent);
    border-radius: 0;
  }

  :global(.theme-setting__strip .theme-setting__item) {
    min-height: 44px;
    padding: 4px 9px;
    border: 0;
    border-right: 1px solid color-mix(in srgb, var(--hairline) 26%, transparent);
    border-radius: 0;
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
  }

  @media (hover: hover) and (pointer: fine) {
    :global(.theme-setting__strip .theme-setting__item) {
      min-height: 34px;
    }
  }

  :global(.theme-setting__strip .theme-setting__item:last-child) {
    border-right: 0;
  }

  :global(.theme-setting__strip .theme-setting__item[data-state="on"]) {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, var(--paper-raised));
  }

  @media (max-width: 359px) {
    .theme-setting {
      align-items: flex-start;
      flex-direction: column;
      padding-block: 10px;
    }

    :global(.theme-setting__strip) {
      width: 100%;
    }

    :global(.theme-setting__strip .theme-setting__item) {
      flex: 1;
    }
  }
</style>
