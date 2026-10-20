# Icon pipeline

> How to add, optimize, and register custom icons from Figma exports.

---

## Overview

The app uses [Tabler Icons](https://tabler.io/icons) (`@tabler/icons-svelte-runes`) as its primary
icon library. Custom icons follow the same `IconProps` interface and are interchangeable with Tabler
icons in all mapping tables.

Import each Tabler icon from its own module, e.g.
`import IconX from "@tabler/icons-svelte-runes/icons/x"`, never from the package root. The root
barrel re-exports about 6,000 components, and Vitest compiles all of them in every worker that
imports it. ESLint rejects value imports from the root; type-only imports such as `Icon` are fine.
This applies to the components in `src/lib/components/ui/` too, including any added from the shadcn
CLI as a starting point.

The pipeline:

1. Export SVG from Figma.
2. Optimize with SVGO (`pnpm run optimize-icons`).
3. Wrap in a Svelte component implementing `IconProps`.
4. Register in the appropriate mapping table in `icon-maps.ts`.

---

## 1. Figma export

Export the icon as SVG from Figma:

- Use a 24 &times; 24 frame with 2px stroke weight (matching Tabler's conventions).
- Set stroke to `currentColor`, fill to `none`.
- Name the component with a descriptive kebab-case name (e.g. `blizzard`, `platonic`).
- Export as SVG.

Drop the exported file into `src/lib/components/icon/custom/raw/`.

---

## 2. Optimization

Run the SVGO optimization script:

```sh
pnpm run optimize-icons
```

This reads from `custom/raw/`, applies the project's `svgo.config.js` (preserves viewBox, removes
dimensions, keeps paths unmerged for editability), and writes to `custom/optimized/`.

Both `raw/` and `optimized/` are gitignored; only the final Svelte component is committed.

---

## 3. Component creation

Create a new `.svelte` file in `src/lib/components/icon/custom/` using the optimized SVG paths.
Follow the pattern in `custom-placeholder.svelte`:

```svelte
<script lang="ts">
  import type { IconProps } from "#lib/components/icon/icon-maps.js";

  let { color = "currentColor", size = 24, stroke = 2, ...rest }: IconProps = $props();
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
  <!-- paste optimized SVG paths here -->
</svg>
```

The component accepts the same props as Tabler icons (`size`, `color`, `stroke`, `class`, plus any
additional attributes via the index signature).

---

## 4. Registration

Import the component and add it to the appropriate mapping table in
`src/lib/components/icon/icon-maps.ts`:

```ts
import CustomBlizzard from "#lib/components/icon/custom/custom-blizzard.svelte";

// In the relevant mapping table:
export const WEATHER_ICON: Record<string, AppIcon> = {
  // ...
  blizzard: CustomBlizzard as unknown as AppIcon,
};
```

The `as unknown as AppIcon` cast is needed because custom components' `IconProps` interface uses an
index signature that doesn't structurally match Tabler's `Icon` type. This is safe because both
accept the same props at runtime.

---

## 5. Verification

1. Check the proof gallery at `/dev/icons` to confirm the icon renders at 16px, 24px, and 32px.
2. Run `pnpm run check`; CI runs the full matrix on the pull request.

---

## Type system

| Type        | Source                         | Purpose                                          |
| ----------- | ------------------------------ | ------------------------------------------------ |
| `AppIcon`   | Alias for Tabler's `Icon` type | The universal icon component type for all tables |
| `IconProps` | Defined in `icon-maps.ts`      | Props interface for custom SVG icon components   |
| `Icon`      | `@tabler/icons-svelte-runes`   | The underlying Tabler component type             |

`AppIcon` is re-exported from `#lib/components/icon/index.js` and should be used in application code
rather than importing `Icon` from Tabler directly.
