<script lang="ts">
  import { IconChevronRight, IconEye, IconPalette, IconTool } from "@tabler/icons-svelte-runes";

  import { resolve } from "$app/paths";
  import BlockySwitch from "$lib/components/blocky-switch.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { theme, type Theme } from "$lib/stores/theme.svelte.js";
  import { userState } from "$lib/stores/user-state.svelte.js";

  let confirmSpoilers = $state(false);
  let spoilerToggleChecked = $state(userState.state.showSpoilers);

  $effect(() => {
    if (!confirmSpoilers) spoilerToggleChecked = userState.state.showSpoilers;
  });

  function setSpoilers(checked: boolean): void {
    if (checked === userState.state.showSpoilers) return;
    if (checked) {
      confirmSpoilers = true;
    } else {
      userState.toggleShowSpoilers();
    }
  }
</script>

<AlertDialog.Root bind:open={confirmSpoilers}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Show spoilers?</AlertDialog.Title>
      <AlertDialog.Description
        >This will reveal hidden content throughout the guide.</AlertDialog.Description
      >
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel onclick={() => (spoilerToggleChecked = false)}
        >Never mind</AlertDialog.Cancel
      >
      <AlertDialog.Action
        onclick={() => {
          userState.toggleShowSpoilers();
          confirmSpoilers = false;
        }}>Yes, show spoilers</AlertDialog.Action
      >
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<div class="quick-settings">
  <div class="quick-settings__row">
    <span class="quick-settings__label"><IconEye class="size-4" />Show spoilers?</span>
    <BlockySwitch
      bind:checked={spoilerToggleChecked}
      label="Show spoilers?"
      onCheckedChange={setSpoilers}
    />
  </div>

  <div class="quick-settings__row quick-settings__row--theme">
    <span class="quick-settings__label"><IconPalette class="size-4" />Theme</span>
    <ToggleGroup.Root
      class="theme-strip"
      type="single"
      value={theme.preference}
      onValueChange={(value) => {
        if (value) theme.set(value as Theme);
      }}
    >
      {#each ["light", "dark", "system"] as const as value (value)}
        <ToggleGroup.Item class="theme-strip__item" {value}>
          {value === "system" ? "Auto" : value === "light" ? "Light" : "Dark"}
        </ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
  </div>

  <a class="quick-settings__link" href={resolve("/data")}>
    <IconTool class="size-4" />
    <span>Data management</span>
    <IconChevronRight class="size-4" />
  </a>
</div>

<style>
  .quick-settings__row,
  .quick-settings__link {
    display: flex;
    min-height: 52px;
    align-items: center;
    gap: 10px;
    padding: 6px 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--hairline) 24%, transparent);
  }

  .quick-settings__row {
    justify-content: space-between;
  }

  .quick-settings__label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }

  .quick-settings__label :global(svg),
  .quick-settings__link :global(svg) {
    color: var(--ink-muted);
  }

  :global(.theme-strip) {
    gap: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--hairline) 42%, transparent);
    border-radius: 0;
  }

  :global(.theme-strip .theme-strip__item) {
    min-height: 34px;
    padding: 4px 9px;
    border: 0;
    border-right: 1px solid color-mix(in srgb, var(--hairline) 26%, transparent);
    border-radius: 0;
    font-family: var(--font-controls);
    font-size: 10px;
  }

  :global(.theme-strip .theme-strip__item:last-child) {
    border-right: 0;
  }

  :global(.theme-strip .theme-strip__item[data-state="on"]) {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, var(--paper-raised));
  }

  .quick-settings__link {
    justify-content: center;
    color: var(--ink-muted);
    font-family: var(--font-controls);
    font-size: 11px;
  }

  .quick-settings__link:is(:hover, :focus-visible) {
    color: var(--primary);
    background: var(--accent);
    outline: 2px solid var(--primary);
    outline-offset: -4px;
  }

  .quick-settings__link span {
    flex: 0 1 auto;
  }

  @media (max-width: 359px) {
    .quick-settings__row--theme {
      align-items: flex-start;
      flex-direction: column;
      padding-block: 10px;
    }

    :global(.theme-strip) {
      width: 100%;
    }

    :global(.theme-strip .theme-strip__item) {
      flex: 1;
    }
  }
</style>
