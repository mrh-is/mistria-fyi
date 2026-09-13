<script lang="ts">
  import { SOURCE_FILTERS } from "$lib/components/icon/index.js";
  import * as Dialog from "$lib/components/ui/dialog/index.js";

  let { open = $bindable(false) }: { open?: boolean } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="source-dialog max-w-[430px] border-0 bg-transparent p-0 shadow-none"
    showCloseButton={false}
  >
    <div class="inventory-tag-wrap">
      <svg class="inventory-tag__string" viewBox="0 0 200 130" aria-hidden="true">
        <path d="M154 112 C111 93 47 80 23 35 C8 7 50 2 102 9" />
      </svg>
      <div class="inventory-tag">
        <div class="inventory-tag__stub" aria-hidden="true">
          <span class="inventory-tag__serial">FG<br />229</span>
          <span class="inventory-tag__ring"><i></i></span>
          <span>Sources</span>
        </div>
        <div class="inventory-tag__body">
          <div class="inventory-tag__heading">
            <div>
              <span class="inventory-tag__overline">Field Guide inventory</span>
              <Dialog.Title>Source groups</Dialog.Title>
            </div>
            <span class="inventory-tag__number">06</span>
          </div>
          <Dialog.Description class="inventory-tag__description">
            These labels describe how an entry can be found. Select any combination in the filter.
          </Dialog.Description>
          <ul class="inventory-tag__list">
            {#each SOURCE_FILTERS as filter (filter.label)}
              {@const SourceIcon = filter.icon}
              <li>
                <SourceIcon class="size-4" />
                <div><strong>{filter.label}</strong><span>{filter.members.join(", ")}</span></div>
              </li>
            {/each}
          </ul>
          <div class="inventory-tag__footer">
            <span>Checked by: you</span>
            <Dialog.Close class="inventory-tag__close">Got it</Dialog.Close>
          </div>
        </div>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>

<style>
  .inventory-tag-wrap {
    position: relative;
    width: 100%;
  }

  .inventory-tag {
    position: relative;
    display: grid;
    grid-template-columns: 74px minmax(0, 1fr);
    width: 100%;
    color: #382d24;
    background: linear-gradient(104deg, #e9c98f, #f0d8aa 48%, #e5c184);
    clip-path: polygon(22px 0, 100% 0, 100% 100%, 22px 100%, 0 calc(100% - 22px), 0 22px);
    filter: drop-shadow(4px 9px 13px rgb(31 23 15 / 30%));
    transform: rotate(-0.35deg);
  }

  .inventory-tag__string {
    position: absolute;
    bottom: calc(50% - 10px);
    left: -75px;
    z-index: 3;
    width: 145px;
    overflow: visible;
    fill: none;
    filter: drop-shadow(0 1px 1px rgb(0 0 0 / 34%));
    pointer-events: none;
    stroke: #fffdf7;
    stroke-linecap: round;
    stroke-width: 2.2;
  }

  .inventory-tag__stub {
    display: flex;
    align-items: center;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
    padding: 18px 10px 15px;
    border-right: 1px dashed rgb(69 49 31 / 35%);
    font-family: var(--font-controls);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }

  .inventory-tag__serial {
    color: #b64235;
    font-family: var(--font-data);
    font-size: 14px;
    line-height: 0.9;
    writing-mode: horizontal-tb;
    transform: rotate(180deg);
  }

  .inventory-tag__ring {
    position: relative;
    display: grid;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 50%;
    background: #a65343;
    box-shadow:
      inset 0 0 0 2px rgb(117 44 35 / 34%),
      0 1px 1px rgb(57 36 23 / 22%);
    transform: rotate(180deg);
  }

  .inventory-tag__ring i {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--paper);
    box-shadow: inset 0 1px 3px rgb(31 23 15 / 38%);
  }

  .inventory-tag__body {
    min-width: 0;
    padding: 15px 16px 13px;
  }

  .inventory-tag__heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid rgb(56 45 36 / 74%);
  }

  .inventory-tag__overline,
  .inventory-tag__number,
  .inventory-tag__footer {
    font-family: var(--font-controls);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .inventory-tag__overline {
    display: block;
    font-size: 8px;
  }

  .inventory-tag__heading :global(h2) {
    margin-top: 2px;
    font-family: var(--font-display);
    font-size: 24px;
    font-style: italic;
    line-height: 1;
  }

  .inventory-tag__number {
    color: #b64235;
    font-family: var(--font-data);
    font-size: 24px;
  }

  :global(.inventory-tag__description) {
    padding: 8px 0;
    border-bottom: 1px solid rgb(56 45 36 / 58%);
    font-family: var(--font-annotation);
    font-size: 11px;
    line-height: 1.35;
  }

  .inventory-tag__list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .inventory-tag__list li {
    display: flex;
    min-width: 0;
    gap: 7px;
    padding: 7px 6px;
    border-right: 1px solid rgb(56 45 36 / 42%);
    border-bottom: 1px solid rgb(56 45 36 / 42%);
  }

  .inventory-tag__list li:nth-child(even) {
    border-right: 0;
  }

  .inventory-tag__list :global(svg) {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  .inventory-tag__list strong,
  .inventory-tag__list span {
    display: block;
  }

  .inventory-tag__list strong {
    font-family: var(--font-controls);
    font-size: 9px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .inventory-tag__list span {
    margin-top: 1px;
    color: #695647;
    font-family: var(--font-annotation);
    font-size: 9px;
    line-height: 1.25;
  }

  .inventory-tag__footer {
    display: flex;
    min-height: 40px;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 8px;
    font-size: 8px;
  }

  :global(.inventory-tag__close) {
    min-width: 68px;
    min-height: 36px;
    border: 1px solid rgb(56 45 36 / 72%);
    font-size: 10px;
  }

  :global(.inventory-tag__close:is(:hover, :focus-visible)) {
    color: #fff8e9;
    background: #a65343;
    outline: 2px solid #fff8e9;
    outline-offset: 2px;
  }

  @media (max-width: 380px) {
    .inventory-tag {
      grid-template-columns: 62px minmax(0, 1fr);
    }

    .inventory-tag__body {
      padding-inline: 11px;
    }

    .inventory-tag__list {
      grid-template-columns: 1fr;
    }

    .inventory-tag__list li,
    .inventory-tag__list li:nth-child(even) {
      border-right: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .inventory-tag {
      transform: none;
    }
  }
</style>
