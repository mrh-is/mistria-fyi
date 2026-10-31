<!--
  Inline SVG filter that adds organic hand-drawn quality to strokes and shapes.
  Renders a hidden <svg> with filter definitions; reference via `filter="url(#pencil)"`,
  `url(#pencil-sm)`, or `url(#pencil-lg)` depending on render size.

  Also defines the provenance marks' tool filters, `mark-<tool>-<seed>`, which
  `provenanceMark` picks per entry.
-->
<script lang="ts">
  import { MARK_FILTER_SEEDS } from "#lib/engine/provenance-marks.js";
</script>

<svg class="absolute" width="0" height="0" aria-hidden="true">
  <defs>
    <!-- Small: utility icons, checkmarks at ~16–24px -->
    <filter id="pencil-sm" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="4" seed="2" result="noise" />
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale="1"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>

    <!-- Default: slash/X marks, medium icons at ~28–40px -->
    <filter id="pencil" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence
        type="turbulence"
        baseFrequency="0.035"
        numOctaves="4"
        seed="2"
        result="noise"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale="1.5"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>

    <!-- Large: category icons at ~48–64px -->
    <filter id="pencil-lg" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence
        type="turbulence"
        baseFrequency="0.025"
        numOctaves="4"
        seed="2"
        result="noise"
      />
      <feDisplacementMap
        in="SourceGraphic"
        in2="noise"
        scale="2.5"
        xChannelSelector="R"
        yChannelSelector="G"
      />
    </filter>

    {#each MARK_FILTER_SEEDS as seed (seed)}
      <!-- Pen: pencil-sm's wobble, with this seed. -->
      <filter id="mark-pen-{seed}" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="4" {seed} result="noise" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale="1"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>

      <!-- Colored pencil: the paper's tooth shows through, and the line wobbles a little. -->
      <filter id="mark-pencil-{seed}" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="1.7"
          numOctaves="2"
          {seed}
          result="grain"
        />
        <feColorMatrix
          in="grain"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.6 0 0 0 2.35"
          result="tooth"
        />
        <feComposite in="SourceGraphic" in2="tooth" operator="in" result="grained" />
        <feTurbulence
          type="turbulence"
          baseFrequency="0.05"
          numOctaves="3"
          seed={seed + 20}
          result="wobble"
        />
        <feDisplacementMap
          in="grained"
          in2="wobble"
          scale="0.9"
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>

      <!-- Rubber stamp: specks the ink missed. -->
      <filter id="mark-stamp-{seed}" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="1.1"
          numOctaves="2"
          {seed}
          result="grain"
        />
        <feColorMatrix
          in="grain"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -6 0 0 0 4.9"
          result="speck"
        />
        <feComposite in="SourceGraphic" in2="speck" operator="in" />
      </filter>

      <!-- Typewriter ribbon: ink that spreads a little & prints unevenly. -->
      <filter id="mark-ribbon-{seed}" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="0.18" result="spread" />
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.9"
          numOctaves="2"
          {seed}
          result="grain"
        />
        <feColorMatrix
          in="grain"
          type="matrix"
          values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -3 0 0 0 2.9"
          result="ink"
        />
        <feComposite in="spread" in2="ink" operator="in" />
      </filter>
    {/each}
  </defs>
</svg>
