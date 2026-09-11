# Icon pipeline & Tabler migration plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Lucide with Tabler Icons, establish a custom SVG icon pipeline from Figma exports,
and unify both under a single `AppIcon` type and `Icon.*` component namespace.

**Spec:** `docs/superpowers/specs/2026-09-11-icon-pipeline.md`

**Tech stack:** SvelteKit 2, Svelte 5 (runes), TypeScript (strict), `@tabler/icons-svelte-runes`
(new), SVGO (new dev dep)

## Global constraints

- The `Icon.*` namespace (`Icon.Season`, `Icon.Source`, etc.) remains the public API for semantic
  icons. Its internal implementation changes from Lucide to Tabler + custom SVGs.
- `AppIcon` (re-exported as `Icon` from Tabler) and `IconProps` replace `LucideIcon` and
  `LucideProps` everywhere.
- Custom SVG components implement `IconProps` from `@tabler/icons-svelte-runes` directly.
- All mapping tables in `icon-maps.ts` use `AppIcon` as their value type.
- Single-use direct imports switch from `@lucide/svelte` to `@tabler/icons-svelte-runes`.
- Follow existing code style: `consistent-type-imports`, `perfectionist` sort rules, double quotes,
  100-char width, kebab-case files.
- Run `pnpm run check` and `pnpm run lint:fix` after every task.

---

### Task 1: Package swap & type foundation

Replace the Lucide package with Tabler and establish the new type exports.

**Files:**

- Modify: `package.json` — remove `@lucide/svelte`, add `@tabler/icons-svelte-runes`, add `svgo` as
  dev dep
- Modify: `src/lib/components/icon/icon-maps.ts` — replace all Lucide imports with Tabler
  equivalents, replace type exports

- [ ] **Step 1: Update dependencies**

```bash
pnpm remove @lucide/svelte
pnpm add @tabler/icons-svelte-runes
pnpm add -D svgo
```

- [ ] **Step 2: Update `icon-maps.ts` imports & types**

Replace the Lucide import block with Tabler equivalents. Tabler uses `Icon` prefixes on component
names (e.g. `Archive` → `IconArchive`, `Heart` → `IconHeart`).

```ts
import {
  IconArchive,
  IconBaby,
  // ... all 55 icons with Icon prefix
} from "@tabler/icons-svelte-runes";

import type { Icon, IconProps } from "@tabler/icons-svelte-runes";
```

Replace the re-exports:

```ts
// Before
export type { LucideIcon, LucideProps } from "@lucide/svelte";
// After
export type { Icon as AppIcon, IconProps } from "@tabler/icons-svelte-runes";
```

Update all mapping table type annotations from `LucideIcon` to `Icon` (imported from Tabler).

**Icon name mapping — Lucide to Tabler:**

Most Lucide icons have direct Tabler equivalents with the `Icon` prefix. Some names differ:

| Lucide           | Tabler                            | Notes                            |
| ---------------- | --------------------------------- | -------------------------------- |
| `BookCheck`      | `IconBookCheck` or `IconBook2`    | Verify visual match              |
| `BookOpenText`   | `IconBookOpen` or `IconBook`      | Verify                           |
| `CircleCheckBig` | `IconCircleCheck`                 | May need `IconCircleCheckFilled` |
| `CircleDashed`   | `IconCircleDashed`                | Direct match                     |
| `CloudLightning` | `IconCloudStorm`                  | Name differs                     |
| `CloudRain`      | `IconCloudRain`                   | Direct match                     |
| `CloudSnow`      | `IconCloudSnow`                   | Direct match                     |
| `CookingPot`     | `IconToolsKitchen2`               | Name differs significantly       |
| `FishingRod`     | `IconFishHook` or `IconFish`      | Verify                           |
| `HandPlatter`    | `IconToolsKitchen`                | Verify                           |
| `HardHat`        | `IconHelmet`                      | Name differs                     |
| `Landmark`       | `IconBuildingBank`                | Name differs                     |
| `Layers`         | `IconStack2` or `IconLayers`      | Verify                           |
| `Octagon`        | `IconOctagon`                     | Direct match                     |
| `PartyPopper`    | `IconConfetti`                    | Name differs                     |
| `PawPrint`       | `IconPaw`                         | Name differs                     |
| `Salad`          | `IconSalad`                       | Direct match                     |
| `ScrollText`     | `IconScroll`                      | May need different variant       |
| `ShoppingCart`   | `IconShoppingCart`                | Direct match                     |
| `Sparkles`       | `IconSparkles`                    | Direct match                     |
| `SunDim`         | `IconSunLow`                      | Name differs                     |
| `TreePine`       | `IconTree` or `IconChristmasTree` | Verify                           |

**Implementation note:** This table is a starting point. The implementer must verify each icon
visually at 16px and 24px. Tabler has different default stroke weight and style, so some icons that
were fine in Lucide may need a different Tabler icon to convey the same meaning. The proof gallery
(Task 5) is the verification tool.

- [ ] **Step 3: Update all direct Lucide imports outside `icon-maps.ts`**

Every file that imports from `@lucide/svelte` must switch to `@tabler/icons-svelte-runes` with the
`Icon` prefix. These are single-use imports that stay as direct imports (not centralized):

| File                             | Lucide icons                                                                       | Tabler equivalents                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `toolbar-footer.svelte`          | `ChevronDown`, `ChevronUp`, `Funnel`, `MessageCircleWarning`, `Search`, `Settings` | `IconChevronDown`, `IconChevronUp`, `IconFilter`, `IconMessageReport`, `IconSearch`, `IconSettings`        |
| `feedback-panel.svelte`          | `ChevronDown`, `Copy`, `MessageCircleWarning`, `SquareMousePointer`, `X`           | `IconChevronDown`, `IconCopy`, `IconMessageReport`, `IconPointer`, `IconX`                                 |
| `feedback-picker.svelte`         | `X`                                                                                | `IconX`                                                                                                    |
| `visibility-panel.svelte`        | `ChevronDown`, `RotateCcw` + type `LucideIcon`                                     | `IconChevronDown`, `IconRotate` + type `Icon`                                                              |
| `npc-relationship-picker.svelte` | `Baby`, `BanknoteCheck`, `Church`, `Gem`, `Heart`, `HeartHandshake`                | `IconBabyCarriage`, `IconReceipt2`, `IconBuildingChurch`, `IconDiamond`, `IconHeart`, `IconHeartHandshake` |
| `page-header.svelte`             | `ArrowLeft`                                                                        | `IconArrowLeft`                                                                                            |
| `welcome-card.svelte`            | `FileDown`, `Pencil`, `QrCode`                                                     | `IconFileDownload`, `IconPencil`, `IconQrcode`                                                             |
| `stepper.svelte`                 | `Minus`, `Plus`                                                                    | `IconMinus`, `IconPlus`                                                                                    |
| `+error.svelte`                  | `House`                                                                            | `IconHome`                                                                                                 |
| `+page.svelte` (home)            | `Library`                                                                          | `IconBooks` or `IconLibrary`                                                                               |
| `settings/+page.svelte`          | `Bot`, `MessageCircleWarning`                                                      | `IconRobot`, `IconMessageReport`                                                                           |
| `backup-card.svelte`             | `FileUp`, `Upload`                                                                 | `IconFileUpload`, `IconUpload`                                                                             |
| `danger-zone-card.svelte`        | `RotateCcw`, `Trash2`                                                              | `IconRotate`, `IconTrash`                                                                                  |
| `import-card.svelte`             | `Check`, `Copy`, `Monitor`, `Upload`                                               | `IconCheck`, `IconCopy`, `IconDeviceDesktop`, `IconUpload`                                                 |
| `spoilers-card.svelte`           | `Eye`, `EyeOff`                                                                    | `IconEye`, `IconEyeOff`                                                                                    |
| `transfer-card.svelte`           | `Camera`, `ImagePlus`, `LoaderCircle`, `QrCode`                                    | `IconCamera`, `IconPhotoPlus`, `IconLoader2`, `IconQrcode`                                                 |

Also update `toolbar-state.test.ts` which imports `Circle` for a mock.

- [ ] **Step 4: Update type references in consuming components**

Replace all `LucideIcon` type references with `Icon` (from Tabler) and `LucideProps` with
`IconProps`:

- `icon-category.svelte` — props interface extends `IconProps` instead of `LucideProps`
- `icon-season.svelte` — same
- `icon-source.svelte` — same
- `icon-weather.svelte` — same
- `icon-completion.svelte` — same
- `icon-restriction.svelte` — same
- `icon-progress-mark.svelte` — same
- `icon-ui.svelte` — same
- `index.ts` (barrel) — re-export `AppIcon` and `IconProps` instead of `LucideIcon` and
  `LucideProps`
- `categories.ts` — `CategoryMeta.icon` type changes from `LucideIcon` to `AppIcon`
- `visibility-panel.svelte` — uses `LucideIcon` type for a prop

- [ ] **Step 5: Run `pnpm run check` and `pnpm run lint:fix`**

Expect type errors if any Tabler icon name was guessed wrong. Fix iteratively.

- [ ] **Step 6: Commit**

```
feat: replace Lucide with Tabler Icons

Switch the icon library from @lucide/svelte to @tabler/icons-svelte-runes
across all centralized mappings and direct imports. Update type exports
from LucideIcon/LucideProps to AppIcon/IconProps.

Part of #130.
```

---

### Task 2: Custom SVG icon infrastructure

Create the directory structure and component pattern for custom Figma-exported icons.

**Files:**

- Create: `src/lib/components/icon/custom/` directory
- Create: `src/lib/components/icon/custom/custom-placeholder.svelte` — a minimal example component
  that validates the pattern compiles
- Create: `svgo.config.js` — SVGO configuration for icon optimization

- [ ] **Step 1: Create SVGO config**

```js
// svgo.config.js
export default {
  plugins: [
    "removeDoctype",
    "removeXMLProcInst",
    "removeComments",
    "removeMetadata",
    "removeEditorsNSData",
    "cleanupAttrs",
    "mergeStyles",
    "inlineStyles",
    "minifyStyles",
    "cleanupIds",
    "removeUselessDefs",
    "cleanupNumericValues",
    "convertColors",
    "removeUnknownsAndDefaults",
    "removeNonInheritableGroupAttrs",
    "removeUselessStrokeAndFill",
    "cleanupEnableBackground",
    "removeHiddenElems",
    "removeEmptyText",
    "convertShapeToPath",
    "convertEllipseToCircle",
    "moveGroupAttrsToElems",
    "collapseGroups",
    "convertTransform",
    "removeEmptyAttrs",
    "removeEmptyContainers",
    "removeUnusedNS",
    "sortAttrs",
    "sortDefsChildren",
    "removeTitle",
    "removeDesc",
    {
      name: "removeAttrs",
      params: { attrs: ["xml:space", "data-name"] },
    },
    {
      name: "removeViewBox",
      active: false,
    },
    {
      name: "removeDimensions",
      active: true,
    },
    {
      name: "mergePaths",
      active: false,
    },
    {
      name: "convertPathData",
      params: { floatPrecision: 2 },
    },
  ],
};
```

- [ ] **Step 2: Create placeholder custom icon**

Create `src/lib/components/icon/custom/custom-placeholder.svelte` following the spec pattern:

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
  <circle cx="12" cy="12" r="10" />
  <line x1="12" y1="8" x2="12" y2="12" />
  <line x1="12" y1="16" x2="12.01" y2="16" />
</svg>
```

This is a temporary placeholder to validate that the custom component pattern compiles, type-checks,
and can be used in mapping tables alongside Tabler icons. Remove it when real custom icons arrive.

- [ ] **Step 3: Verify type compatibility**

In `icon-maps.ts`, temporarily add the placeholder to a mapping to confirm that a custom component
is assignable to the same type as a Tabler icon:

```ts
import CustomPlaceholder from "$lib/components/icon/custom/custom-placeholder.svelte";

// Add temporarily to verify type compatibility, then remove
const _typeCheck: AppIcon = CustomPlaceholder;
```

If this doesn't compile, adjust the custom component's props interface or the `AppIcon` type
definition until both Tabler and custom icons are assignable. Remove the type-check line after
verifying.

- [ ] **Step 4: Add `optimize-icons` script to `package.json`**

```json
"optimize-icons": "svgo --config svgo.config.js -f src/lib/components/icon/custom/raw -o src/lib/components/icon/custom/optimized"
```

This expects raw Figma exports to be dropped into `custom/raw/` and produces optimized SVGs in
`custom/optimized/`. The optimized SVG paths are then manually copied into the corresponding
`.svelte` component. (The `raw/` and `optimized/` directories can be gitignored since the canonical
form is the `.svelte` component.)

- [ ] **Step 5: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 6: Commit**

```
feat: add custom SVG icon infrastructure

Add SVGO configuration, placeholder custom icon component, and
optimize-icons script for processing Figma SVG exports into Svelte
components with Tabler-compatible IconProps.

Part of #130.
```

---

### Task 3: Proof gallery

Create a dev-only route that renders every icon in use for visual verification.

**Files:**

- Create: `src/routes/dev/icons/+page.svelte`

- [ ] **Step 1: Create the gallery page**

The page should:

- Import all mapping tables from `icon-maps.ts`.
- Import the barrel `Icon` namespace.
- Render each semantic category (Source, Season, Weather, Category, Completion, Restriction,
  ProgressMark, UI) as a labeled section.
- Within each section, render every icon at 16px, 24px, and 32px with its mapping key as a label.
- For weather icons, render the full matrix: each weather type × each season.
- Include a theme toggle or render side-by-side light/dark columns.
- Include a "Custom" section that renders any custom icon components from `custom/`.
- Style minimally: a grid of icon + label cells, grouped by section.

The page does not need to be excluded from production builds at this stage (it's a route with no
sensitive content), but it should not be linked from navigation.

- [ ] **Step 2: Run `pnpm run check` and `pnpm run lint:fix`**

- [ ] **Step 3: Visual review**

Start the dev server and review every icon at each size. Note any Tabler icons that don't convey the
intended meaning as well as their Lucide predecessors. These may need swapping to a different Tabler
icon.

- [ ] **Step 4: Commit**

```
feat: add dev icon proof gallery

Dev-only route at /dev/icons that renders every semantic icon mapping at
16px, 24px, and 32px for visual verification after the Tabler migration.

Part of #130.
```

---

### Task 4: Icon selection review & visual tuning

After the gallery is live, review every icon for semantic fit and visual quality at actual usage
sizes. This task is iterative and may require multiple passes.

- [ ] **Step 1: Review source icons**

Walk through every `SOURCE_ICON` entry in the gallery. For each, verify:

- The icon conveys the source type at 16px (the size used in tracker rows).
- The icon is visually distinct from other source icons in the same filter group.

Document any swaps needed.

- [ ] **Step 2: Review category, season, weather, completion, restriction, and UI icons**

Same verification for each category. Pay particular attention to:

- Season icons: the fall leaf flip (`-scale-y-100 rotate-90`) may need adjustment if Tabler's leaf
  has different orientation.
- Weather icons: verify the blizzard/heavy-inclement icon reads as "severe" at small sizes.
- Completion icons: the three states (none/obtained/completed) must be instantly distinguishable.

- [ ] **Step 3: Apply swaps**

Update `icon-maps.ts` with any icon substitutions identified in steps 1–2.

- [ ] **Step 4: Run full verification**

```bash
pnpm run check && pnpm run lint && pnpm run test 2>&1 | tail -30
```

- [ ] **Step 5: Commit**

```
fix: tune icon selections after Tabler migration

Swap [list specific icons changed] for better semantic fit and small-size
readability after visual review in the proof gallery.

Part of #130.
```

---

### Task 5: Documentation

Write the export procedure so the Figma → repo workflow is documented.

**Files:**

- Create or update: `docs/icon-pipeline.md`

- [ ] **Step 1: Write the export procedure doc**

Cover:

1. Figma file link and structure (master components page, naming convention).
2. Export steps: select component, export as SVG.
3. Optimization: `pnpm run optimize-icons` (drop raw SVG into `custom/raw/`, get optimized output).
4. Component creation: copy optimized SVG paths into a new `.svelte` file using the `IconProps`
   pattern.
5. Registration: add the component to the appropriate mapping table in `icon-maps.ts`.
6. Verification: check the proof gallery, run `pnpm run check && pnpm run lint`.
7. PR: open a PR with the new icon.

- [ ] **Step 2: Commit**

```
docs: add icon pipeline export procedure

Document the Figma → SVGO → Svelte component → icon-maps workflow for
adding custom icons to the application.

Part of #130.
```

---

### Task 6: Full verification & PR

- [ ] **Step 1: Run the complete verification matrix**

```bash
pnpm run check
pnpm run lint
pnpm run test
pnpm run build
```

- [ ] **Step 2: Browser review**

Start the dev server and verify:

- Home page category grid icons render correctly.
- Category headers show correct icons.
- Tracker rows show source, season, weather, completion, and restriction icons.
- NPC pages show birthday season icons and relationship progress marks.
- Renown pages show rank stars.
- Toolbar footer shows search, filter, settings, chevron, and feedback icons.
- Settings pages show all utility icons.
- Both light and dark themes.
- At 320px mobile width.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin claude/icon-figma-repo-pipeline-d18f67
```

Open a PR against `main` (will need to rebase onto the merged `130-category-migration` first):

```
feat: replace Lucide with Tabler Icons & add custom icon pipeline

- Swap @lucide/svelte for @tabler/icons-svelte-runes across all
  centralized icon mappings and direct imports
- Unify type system under AppIcon (Tabler's Icon type) and IconProps
- Add custom SVG icon infrastructure: SVGO config, component pattern,
  optimize-icons script
- Add dev proof gallery at /dev/icons for visual verification
- Document the Figma → SVGO → Svelte component export procedure

Part of #130.
Closes #3 (once custom platonic/blizzard icons are added).
```
