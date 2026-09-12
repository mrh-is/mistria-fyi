# Icon pipeline & library migration spec

## Summary

Replace Lucide with Tabler Icons as the general-purpose icon library and establish a pipeline for
custom SVG icons designed in Figma. This is part of the visual identity rebrand (#130) and a
breaking API change to the existing `Icon.*` component system.

## Motivation

Lucide has become strongly associated with AI-generated design. The rebrand is an opportunity to
switch to a library with equivalent coverage but a less recognizable fingerprint. Tabler Icons
provides 5,700+ icons, solid TypeScript support, and a Svelte 5 runes package
(`@tabler/icons-svelte-runes`).

Separately, the project needs custom icons for domain-specific concepts (issue #3, issue #131) that
no general-purpose library covers. These will be designed in Figma and exported as SVGs. The
pipeline ensures those custom SVGs meet quality standards and integrate through the same component
interface as library icons.

## Design decisions

### Figma as source of truth

The Figma file ([Mistria Field Guide icons][figma-link]) is the authoritative source for all custom
icon designs. The flow is strictly one-directional:

```
Figma master components → manual export → SVG validation/optimization → repository → application
```

No Figma API integration, plugins, or backward sync. Contributors who submit SVGs through GitHub are
submitting proposals; the canonical version lives in Figma until exported by the designer.

[figma-link]: https://www.figma.com/design/bbG7eNiE2wtWLYSdncHP0L/Mistria-Field-Guide-icons

### Icon library: Tabler

- Package: `@tabler/icons-svelte-runes`
- Replaces: `@lucide/svelte`
- Type export: `Icon` (from `@tabler/icons-svelte-runes`) replaces `LucideIcon`
- Props: `size`, `color`, `stroke`, `class`, plus forwarded SVG attributes

### Unified component interface

The existing `Icon.*` namespace (`Icon.Season`, `Icon.Source`, etc.) remains the public API for
semantic icon usage. Internally, each variant component resolves to either a Tabler component or a
custom SVG component through the same mapping layer.

Custom SVG icons are Svelte components that accept the same props interface as Tabler icons (`size`,
`color`, `stroke`, `class`). This makes them interchangeable at call sites.

### Custom SVG requirements

Exported SVGs must:

- Use a `0 0 24 24` viewBox (matching Tabler's default grid).
- Use `currentColor` for stroke/fill (no hardcoded colors).
- Use stroke-based rendering with `stroke-width="2"` as baseline (matching Tabler's default weight).
- Contain no editor metadata, embedded fonts, or raster images.
- Consist of a single `<svg>` root with path/shape children only.

## Architecture

### Directory structure

```
src/lib/components/icon/
├── custom/                    # Custom SVG icon components
│   ├── custom-blizzard.svelte
│   ├── custom-platonic.svelte
│   └── ...
├── icon-maps.ts               # Mapping tables (Tabler + custom refs)
├── icon-category.svelte       # Semantic variant components (existing)
├── icon-season.svelte
├── icon-source.svelte
├── icon-weather.svelte
├── icon-completion.svelte
├── icon-restriction.svelte
├── icon-progress-mark.svelte
├── icon-ui.svelte
└── index.ts                   # Barrel export
```

### Custom icon component pattern

Each custom icon is a `.svelte` file that renders an inline `<svg>` and accepts Tabler's `IconProps`
interface, so custom and library icons are interchangeable everywhere:

```svelte
<script lang="ts">
  import type { IconProps } from "@tabler/icons-svelte-runes";

  let { size = 24, color = "currentColor", stroke = 2, ...rest }: IconProps = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={color}
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  {...rest}
>
  <!-- paths from optimized SVG -->
</svg>
```

### Type compatibility

Tabler types its icons as `Component<IconProps>`. Custom icons implement the same `IconProps`
interface, so a single type covers both:

```typescript
import type { Icon } from "@tabler/icons-svelte-runes";

// Icon is Component<IconProps> — works for both Tabler and custom icons
export type AppIcon = Icon;
```

All mapping tables, component props, and barrel re-exports use `AppIcon` (or re-export `Icon`
directly) instead of `LucideIcon`.

### SVG optimization

Run SVGO on exported SVGs before converting to components. Configuration:

- Remove editor metadata (`removeMetadata`, `removeEditorsNSData`).
- Remove comments and empty groups.
- Collapse useless groups.
- Preserve `viewBox`; remove `width`/`height` (the component sets these from props).
- Do **not** merge paths (preserves stroke semantics).
- Do **not** convert strokes to fills.

This can be a manual `pnpm exec svgo` step documented in the export procedure, or a lightweight
validation script. It does not need to be a build-time transform.

### Proof gallery

A dev-only route (`/dev/icons` or similar, excluded from production builds) that renders:

- Every Tabler icon in use, grouped by semantic category.
- Every custom icon.
- Both at 16px, 24px, and 32px (actual usage sizes).
- In both light and dark themes.
- With the icon's mapping key as a label.

### Migration scope

All current Lucide imports are centralized in `icon-maps.ts` (55 icons) plus a handful of direct
imports in single-use contexts. The migration:

1. Replace `@lucide/svelte` with `@tabler/icons-svelte-runes` in `package.json`.
2. Update every import in `icon-maps.ts` to Tabler equivalents.
3. Update type references (`LucideIcon` → new app icon type, `LucideProps` → new props type).
4. Find and update any direct `@lucide/svelte` imports outside the icon system.
5. Verify visual parity at usage sizes; some Tabler icons may need different selections than their
   Lucide counterparts.

## Out of scope

- Figma API integration or export automation.
- Animated icons.
- Multi-color or illustration-style icons.
- Entity-specific icons (#131); that issue tracks its own evaluation.

## Related issues

- #130 — visual identity rebrand (parent)
- #3 — custom platonic-relationship and blizzard icons (first custom icons through this pipeline)
- #131 — entity-specific icon evaluation (future; may use this pipeline)
- #17 — PWA icon artwork (separate concern; app identity, not tracker icons)
