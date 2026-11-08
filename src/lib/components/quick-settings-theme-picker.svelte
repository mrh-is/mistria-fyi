<script lang="ts">
  import IconPalette from "@tabler/icons-svelte-runes/icons/palette";

  import SegmentedPicker from "#lib/components/segmented-picker.svelte";
  import * as m from "#lib/paraglide/messages.js";
  import { theme } from "#lib/stores/theme.svelte.js";

  import type { Theme } from "#lib/stores/theme.svelte.js";

  const themes: Theme[] = ["light", "dark", "system"];
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
  <SegmentedPicker
    mode="theme"
    choices={themes}
    value={theme.preference}
    onSelect={(value) => theme.set(value)}
  >
    {#snippet content(value)}
      {themeLabels[value]}
    {/snippet}
  </SegmentedPicker>
</div>

<style>
  .theme-setting {
    display: flex;
    min-height: 52px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--color-ink-hairline) 24%, transparent);
  }

  .theme-setting__label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--color-ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  @media (max-width: 359px) {
    .theme-setting {
      align-items: flex-start;
      flex-direction: column;
      padding-block: 10px;
    }
  }
</style>
