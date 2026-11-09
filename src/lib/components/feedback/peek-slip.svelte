<script lang="ts">
  import IconFileText from "@tabler/icons-svelte-runes/icons/file-text";

  import * as m from "#lib/paraglide/messages.js";

  let {
    label,
    onclick,
  }: {
    /** Names what the slip opens, beyond the visible “Peek”. */
    label: string;
    onclick: () => void;
  } = $props();
</script>

<!--
  A torn-off scrap of the preview sheet: dot-grid paper with a dog-eared corner. Opening it shows an
  extra without turning it on. The paper is a child, so its clipped corner doesn't clip the button's
  tap area.
-->
<button class="peek-slip" type="button" aria-label={label} aria-haspopup="dialog" {onclick}>
  <span class="peek-slip__paper">
    <IconFileText class="size-3 shrink-0" aria-hidden="true" />{m.feedback_peek_action()}
  </span>
</button>

<style>
  .peek-slip {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    color: var(--color-ink);
    filter: drop-shadow(0 0 0.5px var(--color-ink-hairline)) drop-shadow(var(--shadow-tag-string));
  }

  /* A 44px-tall tap area, without making the slip itself any bigger. */
  .peek-slip::before {
    position: absolute;
    inset: -10px -4px;
    content: "";
  }

  .peek-slip__paper {
    position: relative;
    display: inline-flex;
    min-height: 24px;
    align-items: center;
    gap: 4px;
    padding: 3px 14px 3px 7px;
    background-color: var(--color-paper-raised);
    background-image: radial-gradient(
      circle,
      color-mix(in srgb, var(--color-ink-hairline) 45%, transparent) 0.8px,
      transparent 1px
    );
    background-position: 2px 2px;
    background-size: 6px 6px;
    clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    letter-spacing: 0.04em;
    transform: rotate(-1.5deg);
    transition: transform 120ms ease-out;
  }

  /* The folded-down corner. */
  .peek-slip__paper::after {
    position: absolute;
    top: 0;
    right: 0;
    width: 8px;
    height: 8px;
    background: linear-gradient(
      225deg,
      transparent 50%,
      color-mix(in srgb, var(--color-ink-hairline) 55%, var(--color-paper-sunken)) 50%
    );
    content: "";
  }

  .peek-slip:hover .peek-slip__paper {
    transform: rotate(-1.5deg) translateY(-1px);
  }

  .peek-slip:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .peek-slip__paper,
    .peek-slip:hover .peek-slip__paper {
      transform: none;
      transition: none;
    }
  }
</style>
