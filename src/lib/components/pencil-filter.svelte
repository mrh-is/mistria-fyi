<!--
  Inline SVG filter that adds organic hand-drawn quality to strokes and shapes.
  Renders a hidden <svg> with filter definitions; reference via `filter="url(#pencil)"`,
  `url(#pencil-sm)`, or `url(#pencil-lg)` depending on render size.
-->
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
  </defs>
</svg>
