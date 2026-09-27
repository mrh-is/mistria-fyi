<script lang="ts">
  import { IconChevronRight, IconEye, IconInfoCircle, IconTool } from "@tabler/icons-svelte-runes";

  import BlockySwitch from "$lib/components/blocky-switch.svelte";
  import QuickSettingsLanguagePicker from "$lib/components/quick-settings-language-picker.svelte";
  import QuickSettingsThemePicker from "$lib/components/quick-settings-theme-picker.svelte";
  import TagDialog from "$lib/components/tag-dialog.svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import * as m from "$lib/paraglide/messages.js";
  import { userState } from "$lib/stores/user-state.svelte.js";
  import { localizedHref } from "$lib/utils/localized-href.js";

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

<TagDialog bind:open={confirmSpoilers} size="narrow">
  <div class="spoiler-tag__body">
    <div class="spoiler-tag__heading">
      <Dialog.Title>{m.settings_show_spoilers()}</Dialog.Title>
      <Dialog.Description class="spoiler-tag__desc"
        >{m.settings_spoilers_dialog_description()}</Dialog.Description
      >
    </div>
  </div>
  <div class="spoiler-tag__footer">
    <button
      class="spoiler-tag__btn"
      type="button"
      onclick={() => {
        confirmSpoilers = false;
        spoilerToggleChecked = false;
      }}>{m.settings_spoilers_cancel()}</button
    >
    <button
      class="spoiler-tag__btn spoiler-tag__btn--confirm"
      type="button"
      onclick={() => {
        userState.toggleShowSpoilers();
        confirmSpoilers = false;
      }}>{m.settings_spoilers_confirm()}</button
    >
  </div>
</TagDialog>

<div class="quick-settings">
  <div class="quick-settings__row">
    <span class="quick-settings__label"
      ><IconEye class="size-3.5" />{m.settings_show_spoilers()}</span
    >
    <BlockySwitch
      bind:checked={spoilerToggleChecked}
      label={m.settings_show_spoilers()}
      onCheckedChange={setSpoilers}
    />
  </div>

  <QuickSettingsThemePicker />

  <QuickSettingsLanguagePicker />

  <div class="quick-settings__links">
    <a class="quick-settings__link" href={localizedHref("/data")}>
      <IconTool class="size-4" />
      <span>{m.settings_data_link()}</span>
      <IconChevronRight class="size-4" />
    </a>
    <a class="quick-settings__link" href={localizedHref("/about")}>
      <IconInfoCircle class="size-4" />
      <span>{m.settings_about_link()}</span>
      <IconChevronRight class="size-4" />
    </a>
  </div>
</div>

<style>
  .quick-settings__row {
    display: flex;
    min-height: 52px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 18px;
    border-bottom: 1px solid color-mix(in srgb, var(--hairline) 24%, transparent);
  }

  .quick-settings__label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-2xs);
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .quick-settings__link :global(svg) {
    color: var(--ink-muted);
  }

  .quick-settings__link {
    display: flex;
    min-width: 0;
    min-height: 52px;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 6px 12px;
    color: var(--ink-muted);
    font-family: var(--font-controls);
    font-size: var(--text-2xs);
  }

  .quick-settings__links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border-bottom: 1px solid color-mix(in srgb, var(--hairline) 24%, transparent);
  }

  .quick-settings__link + .quick-settings__link {
    border-left: 1px solid color-mix(in srgb, var(--hairline) 24%, transparent);
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

  .spoiler-tag__body {
    padding: 15px 16px 0;
  }

  .spoiler-tag__heading {
    padding-bottom: 12px;
  }

  :global(.spoiler-tag__desc) {
    margin-top: 6px;
    color: var(--tag-muted);
    font-family: var(--font-annotation);
    font-size: var(--text-xs-plus);
    line-height: 1.4;
  }

  .spoiler-tag__footer {
    display: flex;
    gap: 8px;
    padding: 12px 16px 16px;
  }

  .spoiler-tag__btn {
    min-height: 40px;
    flex: 1;
    border: 1px solid color-mix(in srgb, var(--tag-ink) 42%, transparent);
    font-family: var(--font-controls);
    font-size: var(--text-3xs);
  }

  .spoiler-tag__btn:is(:hover, :focus-visible) {
    outline: 2px solid var(--tag-accent);
    outline-offset: -4px;
  }

  .spoiler-tag__btn--confirm {
    color: var(--tag-highlight);
    border-color: var(--tag-accent);
    background: var(--tag-accent);
  }

  .spoiler-tag__btn--confirm:is(:hover, :focus-visible) {
    outline-color: var(--tag-highlight);
  }
</style>
