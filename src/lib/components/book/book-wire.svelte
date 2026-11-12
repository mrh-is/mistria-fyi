<!--
  The wire binding: one coil every 16px, through a punched hole near the page's edge. At book widths
  it runs down the page's left edge; on phones it runs along the top. The shell gives it its own
  view-transition name, so it stays put while a page turns.
-->
<div class="book-wire" aria-hidden="true">
  <svg class="book-wire__down" width="40" height="100%">
    <defs>
      <pattern id="book-wire-down" width="40" height="16" patternUnits="userSpaceOnUse">
        <rect x="33" y="8" width="5" height="4" rx="1.5" fill="var(--color-wire-hole)" />
        <path d="M4.5 10 C 6 1, 31 1, 35.5 10" stroke="var(--color-wire)" stroke-width="2.4" />
        <path
          d="M5 8.8 C 7 1, 30 1, 35 8.8"
          stroke="var(--color-wire-highlight)"
          stroke-width="0.8"
        />
      </pattern>
    </defs>
    <rect width="40" height="100%" fill="url(#book-wire-down)" />
  </svg>
  <svg class="book-wire__across" width="100%" height="40">
    <defs>
      <pattern id="book-wire-across" width="16" height="40" patternUnits="userSpaceOnUse">
        <rect x="8" y="33" width="4" height="5" rx="1.5" fill="var(--color-wire-hole)" />
        <path d="M10 35.5 C 1 31, 1 6, 10 4.5" stroke="var(--color-wire)" stroke-width="2.4" />
        <path
          d="M8.8 35 C 1 30, 1 7, 8.8 5"
          stroke="var(--color-wire-highlight)"
          stroke-width="0.8"
        />
      </pattern>
    </defs>
    <rect width="100%" height="40" fill="url(#book-wire-across)" />
  </svg>
</div>

<style>
  .book-wire {
    view-transition-name: book-wire;
    pointer-events: none;
  }

  .book-wire svg {
    vertical-align: top;
    fill: none;
    stroke-linecap: round;
  }

  .book-wire__down {
    display: none;
  }

  /* Matches the `book` variant in app.css. */
  @media (min-width: 48rem) and (min-height: 34rem) {
    .book-wire__down {
      display: block;
    }

    .book-wire__across {
      display: none;
    }
  }
</style>
