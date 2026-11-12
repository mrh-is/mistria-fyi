<script lang="ts">
  import IconFileText from "@tabler/icons-svelte-runes/icons/file-text";

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
    <IconFileText class="size-3 shrink-0" aria-hidden="true" />Peek
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

  /*
   * Its dots line up with the type, as on the preview sheet: one column per mono character plus its
   * tracking, & one row on each edge of the line. The icon & its gap fill exactly two columns.
   */
  .peek-slip__paper {
    --fs: var(--text-2xs);
    --ls: 1.6px;
    /* IBM Plex Mono advances 0.6em per character; the tracking makes room for one dot. */
    --cw: calc(var(--fs) * 0.6 + var(--ls));
    --lh: calc(var(--fs) * 12 / 11);
    --padx: 7px;
    --pady: calc(var(--lh) / 2);

    position: relative;
    display: inline-flex;
    align-items: center;
    gap: calc(2 * var(--cw) - 12px);
    padding: var(--pady) 14px var(--pady) var(--padx);
    background-color: var(--color-paper-raised);
    background-image: radial-gradient(
      circle,
      color-mix(in srgb, var(--color-ink-hairline) 24%, transparent) 0.75px,
      transparent 0.95px
    );
    background-position: calc(var(--padx) + var(--cw) / 2 - var(--ls) / 2)
      calc(var(--pady) - var(--lh) / 2);
    background-size: var(--cw) var(--lh);
    clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
    font-family: var(--font-data);
    font-size: var(--fs);
    letter-spacing: var(--ls);
    line-height: var(--lh);
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
