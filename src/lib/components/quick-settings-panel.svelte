<script lang="ts">
  import {
    IconChevronRight,
    IconEye,
    IconInfoCircle,
    IconPalette,
    IconTool,
  } from "@tabler/icons-svelte-runes";
  import { Dialog as DialogPrimitive } from "bits-ui";

  import { resolve } from "$app/paths";
  import BlockySwitch from "$lib/components/blocky-switch.svelte";
  import * as Dialog from "$lib/components/ui/dialog/index.js";
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

<Dialog.Root bind:open={confirmSpoilers}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class="spoiler-dialog__overlay" />
    <DialogPrimitive.Content class="spoiler-dialog">
      <div class="spoiler-tag-wrap">
        <svg class="spoiler-tag__string" viewBox="0 0 120 70" aria-hidden="true">
          <path d="M117 3 C89 2 82 27 60 59" />
        </svg>
        <div class="spoiler-tag">
          <div class="spoiler-tag__stub" aria-hidden="true">
            <span class="spoiler-tag__ring"></span>
          </div>
          <div class="spoiler-tag__body">
            <div class="spoiler-tag__heading">
              <Dialog.Title>Show spoilers?</Dialog.Title>
              <Dialog.Description class="spoiler-tag__desc"
                >This will reveal hidden content throughout the guide.</Dialog.Description
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
              }}>Never mind</button
            >
            <button
              class="spoiler-tag__btn spoiler-tag__btn--confirm"
              type="button"
              onclick={() => {
                userState.toggleShowSpoilers();
                confirmSpoilers = false;
              }}>Yes, show spoilers</button
            >
          </div>
        </div>
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</Dialog.Root>

<div class="quick-settings">
  <div class="quick-settings__row">
    <span class="quick-settings__label"><IconEye class="size-3.5" />Show spoilers?</span>
    <BlockySwitch
      bind:checked={spoilerToggleChecked}
      label="Show spoilers?"
      onCheckedChange={setSpoilers}
    />
  </div>

  <div class="quick-settings__row quick-settings__row--theme">
    <span class="quick-settings__label"><IconPalette class="size-3.5" />Theme</span>
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
  <a class="quick-settings__link" href={resolve("/about")}>
    <IconInfoCircle class="size-4" />
    <span>About this guide</span>
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
    gap: 6px;
    color: var(--ink-muted);
    font-family: var(--font-annotation);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

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

  .spoiler-tag-wrap {
    --tag-accent: #a65343;
    --tag-ink: #312e2b;
    --tag-muted: #68635e;
    --tag-paper: #e2dace;

    position: relative;
    width: 100%;
    filter: drop-shadow(1px -2px 6px rgb(31 23 15 / 18%))
      drop-shadow(3px 8px 16px rgb(31 23 15 / 28%));
  }

  :global(.dark) .spoiler-tag-wrap {
    --tag-accent: #c36d5a;
    --tag-ink: #e8e3dc;
    --tag-muted: #aaa39b;
    --tag-paper: #352f2a;
  }

  .spoiler-tag {
    position: relative;
    display: flex;
    width: 100%;
    flex-direction: column;
    color: var(--tag-ink);
    background: var(--tag-paper);
    clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%, 0 14px);
    -webkit-mask: radial-gradient(circle at 50% 31px, transparent 0 7px, #000 7.5px);
    mask: radial-gradient(circle at 50% 31px, transparent 0 7px, #000 7.5px);
  }

  .spoiler-tag__string {
    position: absolute;
    top: -28px;
    left: calc(50% - 60px);
    z-index: 3;
    width: 120px;
    height: 70px;
    overflow: visible;
    fill: none;
    filter: drop-shadow(0 1px 1px rgb(0 0 0 / 30%));
    pointer-events: none;
    stroke: color-mix(in srgb, var(--tag-ink) 35%, #fff);
    stroke-linecap: round;
    stroke-width: 2.2;
  }

  .spoiler-tag__stub {
    display: flex;
    min-height: 62px;
    align-items: center;
    flex: 0 0 auto;
    justify-content: center;
    border-bottom: 1px dashed color-mix(in srgb, var(--tag-ink) 35%, transparent);
  }

  .spoiler-tag__ring {
    width: 34px;
    height: 34px;
    border: 8px solid var(--tag-accent);
    border-radius: 50%;
    background: transparent;
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--tag-accent) 60%, #000),
      0 0 0 1px color-mix(in srgb, var(--tag-accent) 68%, #000),
      0 1px 1px rgb(57 36 23 / 22%);
  }

  .spoiler-tag__body {
    padding: 15px 16px 0;
  }

  .spoiler-tag__heading {
    padding-bottom: 12px;
  }

  .spoiler-tag__heading :global(h2) {
    font-family: var(--font-display);
    font-size: 24px;
    font-style: italic;
    line-height: 1;
  }

  :global(.spoiler-tag__desc) {
    margin-top: 6px;
    color: var(--tag-muted);
    font-family: var(--font-annotation);
    font-size: 13px;
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
    font-size: 10px;
  }

  .spoiler-tag__btn:is(:hover, :focus-visible) {
    outline: 2px solid var(--tag-accent);
    outline-offset: -4px;
  }

  .spoiler-tag__btn--confirm {
    color: #fff8e9;
    border-color: var(--tag-accent);
    background: var(--tag-accent);
  }

  .spoiler-tag__btn--confirm:is(:hover, :focus-visible) {
    outline-color: #fff8e9;
  }

  :global(.spoiler-dialog__overlay) {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: color-mix(in srgb, var(--paper) 72%, transparent);
  }

  :global(.spoiler-dialog) {
    position: fixed;
    top: 50%;
    left: 50%;
    z-index: 50;
    width: calc(100% - 2rem);
    max-width: 360px;
    outline: none;
  }

  :global(.spoiler-dialog[data-state="open"]) {
    animation: spoiler-tag-enter 320ms cubic-bezier(0.22, 0.8, 0.3, 1) both;
  }

  :global(.spoiler-dialog[data-state="closed"]) {
    animation: spoiler-tag-exit 220ms cubic-bezier(0.55, 0, 0.8, 0.35) both;
  }

  @keyframes spoiler-tag-enter {
    from {
      opacity: 0;
      transform: translate(calc(-50% + 58vw), calc(-50% - 54vh)) rotate(16deg);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(-0.35deg);
    }
  }

  @keyframes spoiler-tag-exit {
    from {
      opacity: 1;
      transform: translate(-50%, -50%) rotate(-0.35deg);
    }
    to {
      opacity: 0;
      transform: translate(calc(-50% + 58vw), calc(-50% - 54vh)) rotate(16deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.spoiler-dialog[data-state]) {
      animation-duration: 0.01ms;
    }
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
