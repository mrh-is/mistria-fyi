# Harvest Helper — UX Review

> Full review of the current app's design, usability, and visual identity.

> Goal: make this feel like a companion to Fields of Mistria — recognizably _for_ that game without
> pretending to be an official product.

---

## Table of Contents

1. [Executive Summary](#executive-summary) _(+ Direction Decided)_
2. [Fields of Mistria Visual Identity](#fields-of-mistria-visual-identity)
3. [Current State Assessment](#current-state-assessment)
4. [Information Architecture](#information-architecture)
5. [Visual Design & Color System](#visual-design--color-system)
6. [Typography](#typography)
7. [Mobile UX & Touch Targets](#mobile-ux--touch-targets)
8. [Component-by-Component Review](#component-by-component-review)
9. [Accessibility & Non-Technical Users](#accessibility--non-technical-users)
10. [Design System Coherence](#design-system-coherence)
11. [Recommendations — Prioritized](#recommendations--prioritized) _(with decision status)_
12. [Visual Audit — Browser Observations](#visual-audit--browser-observations-feb-2026)
13. [Concrete Design Direction](#concrete-design-direction) _(+ implementation specs)_
14. [Implementation Audit — Feb 17, 2026](#implementation-audit--feb-17-2026)
15. [Open Questions](#open-questions-)
16. [Out of Scope](#out-of-scope-separate-tasks-)

---

## Executive Summary

Harvest Helper is a **solid, functional tracker** with clean code and good mobile fundamentals (safe
areas, touch targets, dark mode). It does what it needs to do.

But it has **no visual identity**. Right now it looks like a generic shadcn/ui starter — the default
zinc/slate palette, system fonts, and stock component styling make it indistinguishable from any
other shadcn project. A Fields of Mistria player would have no visual cue that this app is connected
to their game.

The biggest opportunities are:

1. **Inject personality** — color, type, micro-illustrations that say "this is for Mistria"
2. **Improve scannability** — the flat list structure makes categories blend together
3. **Reduce cognitive load** — some controls (availability toggle, world state selector) need
   clearer affordances for non-power-users
4. **Polish the phone experience** — good foundation, but some areas need tighter mobile
   optimization

### Direction Decided

All recommendations in this review have been evaluated. Key decisions:

- 🎨 **Warm pastel palette** — Mistria-inspired cream/mint/rose. Seasonal tinting deferred until
  base palette is proven.
- 🏷️ **Category colors + seasonal tinting** — Start with neither. Prototype each separately after
  the base palette ships, then evaluate one, both, or neither.
- 📐 **Mobile IA redesign** — Compact one-row header + sticky icon toolbar footer (see
  [Mobile Toolbar Specification](#mobile-toolbar-specification)).
- 🔤 **Font** — [SN Pro](https://fonts.google.com/specimen/SN+Pro) for everything (body + display).
  Variable weight axes.
- 👆 **44px touch targets** — Apply everywhere, desktop included.
- 🔒 **Spoiler system** — Quest-locked items get obfuscated with "Continue story quests to unlock."
- ↩️ **Undo toasts** — Sonner/toast for check-off actions (Gmail-style "Undo").
- 🏆 **Completed categories** — "Trophy case" treatment: celebratory but stays out of the way.
- 👋 **Welcome UX** — First-visit onboarding guiding import or manual start. ✅ Done.
- 🎉 **Milestone celebrations** — Confetti/animation for section/category completions. Not
  individual items.
- 🧩 **Design system** — Codify patterns as reusable components (not just conventions/rules).

---

## Fields of Mistria Visual Identity

### What the game looks like

Based on research into the game's aesthetic:

- **Color palette**: Cool pastels — minty greens, soft pinks, cream/off-whites, lavender. Described
  as "bubblegum pastel" reminiscent of Slime Rancher and Ooblets. Distinctly NOT earthy (unlike
  Stardew Valley).
- **UI style**: Menus look like **pastel books/journals**. Very bright, mostly off-white backgrounds
  with pastel accents. Cute, warm, inviting.
- **Art style**: Pixel art with anime-influenced character portraits. Late-90s Harvest Moon
  nostalgia meets modern shojo anime.
- **Typography feel**: Clean, readable, with a slight warmth. Nothing aggressively "gamer."
- **Overall mood**: Cozy, magical, whimsical. Warm despite the cool palette.

### Design cues to borrow (without looking official)

| Cue                                          | How to adapt                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Pastel palette (mint, pink, cream, lavender) | Replace zinc/slate tokens with a warm pastel scheme                                         |
| Book/journal UI metaphor                     | Subtle paper-like textures, soft shadows, rounded corners                                   |
| Seasonal color coding                        | The app already has season icons — lean into seasonal color themes                          |
| Cozy warmth                                  | Warmer backgrounds (cream, not pure white), softer borders                                  |
| Pixel art accent                             | Consider a tiny wheat/farming pixel icon or favicon that evokes the game without copying it |

### What to avoid

- Don't copy the game's actual UI panels, fonts, or character art
- Don't use the official logo or game-specific iconography
- Don't call it "official" or imply endorsement
- The current Lucide icon set is fine — it's neutral and won't be confused for game assets

---

## Current State Assessment

### What's working well ✅

1. **Mobile-first foundation**: Safe area insets, `min-h-dvh`, iOS zoom prevention on inputs,
   pull-to-refresh blocked in PWA mode — this is well-considered.
2. **Dark mode**: Clean implementation with FOUC prevention, system preference sync, and browser
   chrome color updates.
3. **Consistent page structure**: Every category page follows the same pattern (sticky header →
   content), which builds muscle memory.
4. **Search-first design**: The search bar is prominent on the home page and available on categories
   that need it. Good UX instinct.
5. **Progressive disclosure**: Expandable sections prevent overwhelm on high-item-count pages
   (Almanac, Museum).
6. **State management**: Debounced localStorage persistence, merge-not-replace on import — these are
   user-trust decisions done right.
7. **QR transfer**: Clever solution for the "imported on desktop, play on phone" workflow.

### What needs work ⚠️

#### Severity: High

1. **No visual identity** — app is visually generic. Could be any checklist app.
2. **Availability toggle is confusing** — "Timely," "Available," and "Everything" require reading
   tooltip titles to understand. Non-obvious to new or non-technical users.
3. **World state selector appears with no explanation** — season/weather dropdowns are critical to
   how the app works, but there's no onboarding or hint about why they matter.
4. **Empty state on first load** — a new user sees 0% everywhere and a search bar with no results.
   There's no welcome or guidance on what to do first.

#### Severity: Medium

5. **Category grid has low visual hierarchy** — all 9 cards look identical in weight. No way to spot
   which categories have progress vs. which are untouched.
6. **NPC hearts are beautiful but dense** — 12 tiny heart/octagon buttons per NPC, plus +/− buttons.
   On a small phone screen (iPhone SE, 375px wide), this could get tight.
7. **Search results lack category context** — the tiny `text-[10px]` category label is easy to miss.
   Results from different categories look identical.
8. **Settings page is long and undifferentiated** — 5 cards stacked vertically with no visual
   grouping or separation between "I do this once" (Import) and "I might do this daily" (Theme,
   Transfer).
9. **No visual feedback for completion milestones** — checking off all items in a section gives the
   same visual treatment as checking one more box. No celebration or visual distinction.

#### Severity: Low

10. **"Show completed" checkbox feels like an afterthought** — it's in the sticky header but looks
    like a settings option, not a view toggle. Its position below the search bar is not where users
    would expect a filter control.
11. **Back navigation is a bare arrow** — works fine, but the touch target is small (just the icon,
    ~20px) and there's no label.
12. **Tier markers on skill progress bars** — clever feature, but the thin white lines are subtle.
    Users may not notice or understand them.
13. **No loading state for initial data** — `trackerData` appears to load synchronously (imported
    JSON), but if the bundle grows, the blank flash could be noticeable.

---

## Information Architecture

### Home screen hierarchy

Current:

```
Header (title + progress + settings)
Search bar
[Season dropdown] [Weather dropdown]
[Timely] [Available] [Everything]
[Museum] [Almanac]  [Animals] [NPCs]
[Cosmetics] [Skills] [Renown] [Quests]
[Mines]
```

**Issues**:

- World state selector and availability toggle take up significant vertical space but are secondary
  controls. On a small screen, the category grid (the primary interaction) gets pushed below the
  fold.
- The odd 9th card (Mines) sits alone on the last row, creating visual asymmetry.

**Decision — Mobile Toolbar Footer**:

The home page and category pages will share a new **sticky footer toolbar**. On the home page, the
world state selector and availability toggle move into this toolbar, drastically reducing
above-the-fold height. See [Mobile Toolbar Specification](#mobile-toolbar-specification) for full
details.

The odd 9th card (Mines) visual asymmetry remains a minor issue — consider a full-width treatment
for the last card, or grouping it differently.

### Category page hierarchy

Current:

```
Sticky header (← back | icon | name | %  (n/m) )
  [Season] [Weather] (if showWorldState)
  [Timely] [Available] [Everything] (if showWorldState)
  [Search bar] (if onSearch)
  [✓] Show completed
Content area
  ExpandableSection → items
```

**Issues**:

- The sticky header can be very tall on pages with `showWorldState` + search + "Show completed" — up
  to ~200px. On a 667px screen (iPhone SE), this leaves only ~467px for actual content.
- The "Show completed" toggle is always in the header even on pages that don't have many items.

**Decision**: Sticky header becomes one row: `[← Back | Icon + Name | Progress %]`. All filter
controls (world state, availability, search, show completed) move to the sticky footer toolbar. See
[Mobile Toolbar Specification](#mobile-toolbar-specification).

---

## Visual Design & Color System

### Current palette analysis

The app uses shadcn/ui's default "New York" theme with OKLch colors. In practice:

| Token          | Light mode                           | Dark mode                                | Effect                 |
| -------------- | ------------------------------------ | ---------------------------------------- | ---------------------- |
| `--background` | `oklch(1 0 0)` — pure white          | `oklch(0.129 0.042 264.695)` — dark navy | Clean but cold         |
| `--foreground` | `oklch(0.129 ...)` — dark blue-black | `oklch(0.984 ...)` — near-white          | Good contrast          |
| `--primary`    | `oklch(0.208 ...)` — dark purple     | `oklch(0.929 ...)` — light gray          | Invisible as an accent |
| `--accent`     | `oklch(0.968 ...)` — very light gray | `oklch(0.279 ...)` — dark gray           | No personality         |
| `--border`     | `oklch(0.929 ...)` — light gray      | `oklch(1 0 0 / 10%)` — subtle white      | Fine                   |

**Diagnosis**: This is a monochrome gray theme with a faint purple-blue tint from the OKLch hue
channel (~265°). It has no warmth, no personality, and no connection to Fields of Mistria.

### Recommended color direction

To evoke Mistria's pastel aesthetic without copying it:

**Light mode**:

- Background: Warm cream/ivory instead of pure white (e.g., `oklch(0.98 0.005 90)`)
- Primary accent: Soft mint green (`oklch(0.75 0.1 165)`) — the game's signature grass color
- Secondary accent: Soft pink/rose (`oklch(0.8 0.08 350)`) — the game's signature flower/romantic
  color
- Borders: Warm gray-beige, not cool gray
- Cards: Slightly warmer than background, with a very subtle shadow

**Dark mode**:

- Background: Deep midnight blue-green (not pure dark navy)
- Accents: Same hues, lighter values
- Goal: feel like nighttime in the game world, not like a code editor

**Semantic colors** (already partially in place):

- Seasons: Amber (already correct), but could differentiate more (spring=pink, summer=gold,
  fall=orange, winter=blue)
- Progress: Mint green for complete, warm amber for in-progress
- Availability: Keep green/red dots, but make them slightly softer

### Color in the category grid

Right now all 9 category cards are identical visually. Consider giving each category a subtle tint
or icon color:

- Museum: warm brown/amber (artifacts, old things)
- Almanac: green (nature, collecting)
- Animals: pink (cute creatures)
- NPCs: red/rose (hearts, relationships)
- Cosmetics: purple/lavender (fashion)
- Skills: blue (learning, growth)
- Renown: gold (prestige)
- Quests: teal (adventure)
- Mines: dark slate (underground)

This creates instant visual identity for each category and helps with recognition.

---

## Typography

### Current state

- **Font**: System default (`ui-sans-serif, system-ui, sans-serif`). This means San Francisco on
  Apple, Segoe UI on Windows, Roboto on Android.
- **Hierarchy**: `text-lg` → `text-sm` → `text-xs` → `text-[10px]`. Three meaningful levels.
- **Weight**: `font-semibold` for titles, `font-medium` for section headings, default for body.

### Assessment

System fonts are a fine choice for a utility app — fast, familiar, readable. But they contribute to
the "generic" feel. If you want the app to feel more connected to Mistria without importing a heavy
custom font:

**Decision**: Use [SN Pro](https://fonts.google.com/specimen/SN+Pro) as the single typeface for
everything — body text, headings, and the app title. SN Pro is based on Nunito (rounded, warm,
whimsical) but adds variable axes for fine-grained weight control. This replaces system fonts
entirely. Load the variable font file with weights 400–700 (~20–30KB).

**Optional pixel accent** (not decided): [Doto](https://fonts.google.com/specimen/Doto) has a
controllable pixel-roundness axis that could interplay with SN Pro's roundness. Could work for small
decorative labels (category badges, section headers). Not a priority — evaluate after the base
typography is in place. [Jersey 10](https://fonts.google.com/specimen/Jersey+10) was also considered
but neither pixel font is a clear winner yet.

### Specific type issues

- `text-[10px]` appears in several places (category labels in search results, tier labels, NPC
  birthday text). At 10px, this is below comfortable reading size on mobile. **Minimum should be
  11px, ideally 12px.**
- The hierarchy jump from `text-sm` (14px) to `text-xs` (12px) is small. Consider using `text-sm` as
  the floor for interactive text and only using `text-xs` for truly supplementary info.

---

## Mobile UX & Touch Targets

### Touch target sizes

| Element                          | Current size                             | Target (min 44px recommended by Apple, 48dp by Material) | Verdict                                 |
| -------------------------------- | ---------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| Category card                    | Full card (~80px tall)                   | ✅                                                       | Good                                    |
| Back arrow (← on category pages) | `size-5` icon, zero padding on `<a>`     | ❌ ~20px (no padding at all)                             | Needs wrapping in 44px tappable area    |
| Checkbox (shadcn)                | ~20px × 20px                             | ⚠️ Borderline                                            | Acceptable with surrounding row padding |
| NPC heart/octagon buttons        | `p-0.5` around `size-4` icon = ~20px     | ❌ Too small                                             | Should be at least 32px, ideally 44px   |
| +/− buttons on NPC page          | `size-8` = 32px                          | ⚠️ Passable                                              | OK but tight                            |
| +/− buttons on renown page       | `size-6` = 24px                          | ❌ Too small                                             | Increase to at least 32px               |
| Skill level text (click to edit) | `w-12 h-8` = 48×32px                     | ⚠️ Acceptable width, short height                        | OK                                      |
| X button on search bar           | ~16px icon, ~20px target                 | ❌ Too small                                             | Needs padding                           |
| "Show more..." button            | `h-7` = 28px                             | ⚠️ Borderline                                            | Acceptable as it has `w-full` implicit  |
| Quest state cycle button         | `size-5` icon, NO size/padding on button | ❌ ~20px, worse than estimated                           | Needs explicit touch target urgently    |
| ExpandableSection header         | Full-width button, `py-1.5`              | ⚠️ ~30px tall                                            | Should be 44px min                      |

### Critical touch target fixes needed

1. **NPC hearts**: Each heart/octagon is effectively 20px. With 12 in a row plus +/− buttons, that's
   ~280px of touch targets in a row on a ~375px screen. Accidental taps are almost guaranteed.
   Consider: larger targets with scroll, or a slider/stepper instead of individual hearts.
2. **Back button**: The `ArrowLeft` icon is the only touch target. Wrap it in a larger tappable
   area.
3. **Renown +/−**: At 24px (`size-6`), these are definitely too small.
4. **ExpandableSection headers**: At ~30px tall, these are uncomfortable to tap rapidly (e.g.,
   opening/closing multiple sections).

### Scroll behavior

- Sticky headers are implemented correctly with `z-10` and `bg-background`.
- `overscroll-behavior-y: contain` prevents pull-to-refresh in PWA — good.
- No scroll snap or momentum issues noted in code.

### Keyboard handling

- Inline edit fields (skills, renown) handle Enter and Escape — good.
- Number inputs on skill/renown have `max`/`min` constraints — good.
- `font-size: max(16px, 1em)` on inputs prevents iOS zoom — essential PWA detail, well done.

---

## Component-by-Component Review

### Home Page (`+page.svelte`)

- **Good**: Clean, focused. Search is prominent. Progress percentage visible.
- **Verified**: The overall progress display (`OverallProgress`) always shows the "Everything" total
  (e.g., `3% (112/3236)`) regardless of filter — it does NOT change with the availability toggle.
  This is actually good UX (your real progress is always against the full game). However, the
  per-category card counts DO change with the filter (e.g., Museum goes from 0/268 to 0/57 on
  "Timely"), which can be disorienting without explanation.
- **Issue**: Settings gear icon has a small touch target (`p-1` on the anchor = ~28px). Back arrow
  links across all pages are even worse: `size-5` icon with zero padding = ~20px touch target.
- **Suggestion**: Add a subtitle or tagline under "Harvest Helper" — e.g., "Fields of Mistria
  Tracker" — to immediately communicate what this app is for.

### CategoryGrid / CategoryCard

- **Good**: 2-column grid is appropriate for mobile. Progress bar on each card.
- **Issue**: The `sm:hidden` / `hidden sm:inline` toggle shows `%` on mobile and `n/m` on larger
  screens. This is good responsive behavior.
- **Issue**: All cards have identical visual weight. A user with 80% Almanac and 0% Museum sees no
  visual distinction at a glance.
- **Suggestion**: Tint the progress bar color per category. Or show a subtle "complete" state for
  finished categories.

### CategoryHeader

- **Good**: Sticky positioning, search integration, world state controls.
- **Issue**: Very content-heavy. On a page with `showWorldState` + search + "show completed," the
  header consumes ~200px. Consider collapsing.
- **Verified**: Category header progress `X% (n/m)` uses filtered counts — the denominator DOES
  change based on availability mode. Combined with the home page always showing the "Everything"
  total, this creates an inconsistency: home says 3% (112/3236) but entering Museum in "Timely" mode
  shows 0% (0/57). Consider showing both or labeling which total is being used.

### ItemRow

- **Good**: Clean checkbox + name + restriction badges. Expand chevron is subtle (opacity-0, appears
  on hover).
- **Issue**: The expand chevron uses `opacity-0 → group-hover:opacity-60`. On mobile, there's no
  hover. Users won't know items are expandable unless they accidentally tap the name. Consider
  showing the chevron at reduced opacity by default.
- **Issue**: `dimmed` (opacity-50) vs completed (opacity-40 + line-through) are visually similar. In
  a long list, distinguishing "unavailable but incomplete" from "completed" may be difficult.

### SearchBar

- **Good**: Debounced 200ms, loading spinner, clear button.
- **Issue**: The clear button (`X`) has a small touch target.
- **Issue**: Placeholder "Search items..." is vague. Consider "Search all categories..." or "Find an
  item to check off..."

### SearchResults

- **Good**: Shows category label per result, restriction badges, count.
- **Issue**: Category label at `text-[10px]` is very small and right-aligned. It's the primary way
  to know what section a result belongs to. Make it bigger or more prominent (e.g., a colored
  badge).
- **Issue**: No grouping by category. If searching "iron" returns 3 almanac items and 2 museum
  items, they're interleaved by search rank. Consider optional grouping.

### AvailabilityToggle

- **Issue**: The three labels — "Timely," "Available," "Everything" — are jargon. A new user has no
  idea what "Timely" means. The explanations exist as `title` attributes, but these are invisible on
  mobile (no hover).
- **Suggestion**: Use subtitle text below each option, or add a one-line explanation above the
  toggle. E.g., "What items to show:" then "Seasonal only / Currently accessible / All"

### WorldStateSelector

- **Good**: Season and weather dropdowns with appropriate icons. Weather auto-resets when season
  changes.
- **Issue**: There's no explanation of why this matters. A new user would think "why do I need to
  tell the app what season it is?" Brief context text would help: "Set your in-game season to see
  what's available now."

### ExpandableSection

- **Good**: Simple, clean. Slide animation at 150ms feels snappy.
- **Issue**: Touch target height (`py-1.5`) is only ~30px. Should be at least 44px for comfortable
  mobile tapping.
- **Issue**: No visual indication of "this section has completable items inside" vs. "all items in
  this section are done."

### RestrictionBadges

- **Good**: Color-coded (amber for season, sky for weather, muted for time). Compact mode for search
  results.
- **Issue**: The season icons are 12px (`size-3`). Very small, even as supplementary info.
- **Issue**: The building/perk `Lock` icon has no label or tooltip. Users won't know what it means.

### NPC Page

- **Good**: The 12-color heart/octagon progression is delightful — this is the most
  "Mistria-feeling" part of the app. The color gradient from violet to rose mirrors the game.
- **Issue**: Touch targets are too small (discussed above).
- **Issue**: Birthday display (`season-icon + day number`) is very subtle at `text-[10px]`. This is
  useful info that could be more prominent.
- **Suggestion**: Consider grouping NPCs by dateable/non-dateable, or showing a "hearts remaining"
  summary.

### Quests Page

- **Good**: 3-state cycle (none → obtained → completed) with clear iconography and color.
- **Issue**: The quest state button has no explicit size or padding classes at all — just
  `class="shrink-0 transition-colors"`. The `CircleDashed` icon is `size-5` (20px) making the
  effective touch target ~20px. This is the worst touch target in the app and it's a primary
  interaction element.
- **Issue**: The "Active" badge on obtained quests is helpful, but it appears after the quest name,
  meaning it may be off-screen on narrow devices if the name is long.

### Skills Page / SkillRow

- **Good**: Progress bar with tier markers is a smart visualization. Tier name label provides
  context.
- **Issue**: Tier markers (white vertical lines) are very subtle. Could use labels or color changes
  at tier boundaries.
- **Correction**: The game does not use named tiers (Novice, Apprentice, etc.) — they're simply
  "Tier 1" through "Tier 5." Update all tier display labels accordingly.
- **Suggestion**: Color-code the progress bar by tier (e.g., a gradient that shifts through 5 colors
  as the player advances). Use "Tier N" labels, not the invented names currently shown.

### Renown Page

- **Good**: Clear rank progression with current rank highlighted.
- **Issue**: The rank list below the progress bar is a flat text list with minimal styling.
  Completed ranks are `line-through text-xs`, current rank gets `bg-accent`. This works but feels
  underwhelming for what's supposed to represent town prestige.
- **Issue**: +/− buttons are too small (`size-6` = 24px).

### Mines Page

- **Good**: Simple, focused. Floor progress + spells.
- **Issue**: The +/− buttons for floor use `Button size="sm" variant="outline"` which is larger than
  the icon-only buttons on other pages. This inconsistency is noticeable.
- **Issue**: The biome name display ("floors X–Y") shows the biome's start floor but always shows
  `maxFloors` as the end. This may be wrong if there are multiple biomes.

### Settings Page

- **Good**: Well-organized cards. QR transfer is a standout feature.
- **Issue**: The page is a flat stack of 5 cards with no hierarchy. "Theme" (daily use) and "Import
  from Save File" (one-time use) have the same visual weight.
- **Issue**: The "Playing on your phone?" prompt after desktop import is great UX. But it only
  appears after a successful import, and only on desktop. This workflow discovery could be surfaced
  earlier.
- **Verified**: "Danger Zone" card uses `border-red-200 dark:border-red-900`. In practice, the red
  border + red title text combo is actually quite visible in both modes — more effective than the
  class names suggest. This is fine as-is.
- **Issue**: No confirmation feedback after backup export. The download just starts silently.
- **Issue**: Game version text at the bottom (`v0.13.4`) is useful but could link to a changelog or
  update notes.

---

## Accessibility & Non-Technical Users

### ARIA & semantics

- **Good**: Buttons have `type="button"`, checkboxes use shadcn's built-in ARIA.
- **Issue**: No `aria-label` on icon-only buttons (back arrow, settings gear, NPC +/−, renown +/−).
  Screen readers will announce nothing meaningful.
- **Issue**: The ExpandableSection doesn't use `aria-expanded` on its button. The chevron rotation
  is visual-only.
- **Issue**: The quest state cycle button has a `title` attribute but no `aria-label`. Screen
  readers won't convey the current state.
- **Issue**: Progress bars have no `aria-label` describing what they represent.

### Non-technical user concerns

1. **Jargon**: "Timely," "Available," "Everything" — "Almanac" — "World State" — none of these are
   self-explanatory.
2. **No onboarding**: A first-time user gets dumped into an empty tracker with no guidance.
3. **No undo**: Checking/unchecking items is immediate with no undo. Accidental taps on the small
   heart buttons could silently change state.
4. **Import workflow is technical**: "Select player.json" assumes the user knows what a JSON file is
   and where to find it. The file picker on iOS/Android may not navigate to the right location
   easily.
5. **QR transfer assumes camera access**: The fallback "scan from screenshot" is good, but the
   primary flow will confuse users whose browser blocks camera access.

### Contrast and readability

- Light mode contrast appears to meet WCAG AA (dark foreground on white).
- Dark mode uses appropriate light-on-dark values.
- `text-muted-foreground` is `oklch(0.554 ...)` on white — this is roughly #7f7f8f, which may be
  below 4.5:1 contrast ratio for small text. **Should be verified.**
- `text-[10px]` text (used in several places) will be hard to read for anyone with less-than-perfect
  vision.

---

## Design System Coherence

### What's consistent

- Spacing: `gap-2`, `gap-3`, `gap-4` used consistently across pages.
- Component reuse: `CategoryHeader`, `ExpandableSection`, `ItemRow` are properly shared.
- Color tokens: Dark mode correctly inverts all semantic tokens.
- Border radius: Consistent `rounded-md` usage.

### What's inconsistent

| Area                      | Inconsistency                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ~~**+/− button sizing**~~ | ✅ Resolved — all use `stepper.svelte` (44px tap / 32px visual)                                                                |
| **Progress display**      | Home cards: `%` on mobile, `n/m` on desktop. Category headers: always `X% (n/m)`. Inconsistent format.                         |
| **Item row styling**      | Almanac/Museum use `ItemRow` component. Animals/Cosmetics use inline `div` with same structure but slightly different spacing. |
| **Section padding**       | Some pages use `gap-4 px-4 pb-4`, settings uses `gap-4 p-4`. Minor but noticeable.                                             |
| **Completed state**       | Items: `line-through opacity-40`. NPC cards: `opacity-40` only. Ranks: `line-through text-xs` (different size!).               |
| **"All done" message**    | Almanac, Animals, Cosmetics, Museum show "All done! Toggle 'Show completed' to review." Other pages don't.                     |

---

## Recommendations — Prioritized

### Tier 1: Identity & First Impression 🎨

These changes would most transform how the app _feels_.

| #   | Recommendation                                                                                                                              | Effort | Impact    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| 1   | **Custom color palette** — Replace the default zinc/gray with Mistria-inspired pastels. Cream backgrounds, mint/pink accents, warm borders. | Medium | Very High |
| 2   | **Category color coding** — Give each of the 9 categories a subtle color identity. Use it in the card, the header, and the progress bar.    | Medium | High      |
| 3   | **App title treatment** — Add "Fields of Mistria Tracker" subtitle. Consider a display font for "Harvest Helper" only.                      | Low    | High      |
| 4   | **Warm the dark mode** — Shift from cold navy to a warmer midnight. The game has a warm nighttime palette.                                  | Low    | Medium    |

> 📋 **Decisions:** #1 ✅ Accepted · #2 ⏳ Try & evaluate (may be too much with seasonal tinting) ·
> #3 ✅ SN Pro for all text · #4 ✅ Accepted

### Tier 2: Usability for Everyone 🧑‍🌾

These improve the experience for non-power-users.

| #   | Recommendation                                                                                                                                                                             | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------ |
| 5   | **Rewrite availability toggle labels** — Replace "Timely / Available / Everything" with clearer phrasing and visible descriptions. E.g., "Seasonal / Accessible / All Items".              | Low    | High   |
| 6   | **Add context text for world state** — One line: "Set your in-game season and weather" above the dropdowns.                                                                                | Low    | High   |
| 7   | **Welcome/empty state** — When the user has 0% progress, show a brief welcome message explaining what the app does and suggesting they start with Import or just start checking items off. | Medium | High   |
| 8   | **Show item expand chevron on mobile** — The `opacity-0` chevron is invisible without hover. Show it at `opacity-30` by default.                                                           | Low    | Medium |
| 9   | **Bigger search result category labels** — Increase from `text-[10px]` to `text-xs` and consider a colored pill/badge.                                                                     | Low    | Medium |

> 📋 **Decisions:** #5 ✅ Rewrite as "Seasonal only / Accessible now / All items" · #6 ✅ Add
> context text · #7 ✅ Welcome UX with import guidance · #8 ✅ Show chevron by default · #9 ✅
> Increase size + colored badge

### Tier 3: Mobile Polish 📱

These fix real usability friction on phones.

| #   | Recommendation                                                                                                                                                | Effort | Impact |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 10  | **Fix touch targets** — NPC hearts, quest cycle buttons, back arrows, renown +/−, expand section headers. Minimum 44px.                                       | Medium | High   |
| 11  | **Compress sticky header** — On category pages with world state + search + show-completed, collapse into a slimmer layout (e.g., filter button that expands). | Medium | Medium |
| 12  | **Standardize +/− button sizing** — Pick one size (32px minimum) and use it everywhere.                                                                       | Low    | Low    |
| 13  | **Minimum text size of 11px** — Replace all `text-[10px]` usages with `text-[11px]` or `text-xs`.                                                             | Low    | Low    |

> 📋 **Decisions:** #10 ✅ Desktop too · #11 ✅ Redesigned as toolbar footer · #12 ✅ Standardize to
> 32px+ · #13 ✅ Accepted

### Tier 4: Accessibility ♿

| #   | Recommendation                                                                                       | Effort | Impact |
| --- | ---------------------------------------------------------------------------------------------------- | ------ | ------ |
| 14  | **Add `aria-label` to icon-only buttons** — Back arrows, +/−, settings gear, quest cycle.            | Low    | Medium |
| 15  | **Add `aria-expanded` to ExpandableSection** — The button should announce its state.                 | Low    | Low    |
| 16  | **Verify muted-foreground contrast** — Check that `oklch(0.554 0.046 257.417)` on white meets 4.5:1. | Low    | Low    |

> 📋 **Decisions:** #14 ✅ · #15 ✅ · #16 ✅

### Tier 5: Delight & Polish ✨

These are nice-to-haves that would make the app special.

| #   | Recommendation                                                                                                                                                                     | Effort | Impact |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 17  | **Completion celebrations** — When a section/category hits 100%, show a brief visual (confetti, color flash, checkmark animation).                                                 | Medium | Medium |
| 18  | **Progress ring or badge on home** — Replace the text-only `X%` with a small progress ring/arc. More visually engaging.                                                            | Medium | Medium |
| 19  | **Seasonal theme tinting** — When the user has set "Spring," subtly tint the app with pink/green. Summer = gold. Fall = amber. Winter = blue/white. Light touch, not overwhelming. | Medium | Medium |
| 20  | **Better settings hierarchy** — Group into "Everyday" (Theme) and "Data" (Import, Transfer, Backup, Reset) with a visual separator or section headings.                            | Low    | Low    |
| 21  | **Skill tier color progression** — Tint the progress bar by tier (green → blue → gold) instead of a single color.                                                                  | Low    | Low    |

> 📋 **Decisions:** #17 ✅ Milestones only (sections + categories, not individual items) · #18 ✅ ·
> #19 ⏳ Try light touch · #20 ✅ · #21 ✅ Use "Tier N" labels (game doesn't name tiers)

> ➕ **New requirements** from review feedback: Spoiler system, Undo toast, Completed category
> "trophy case," Welcome UX, Text wrapping, Design system components. Full specs in
> [Concrete Design Direction](#concrete-design-direction).

---

## Visual Audit — Browser Observations (Feb 2026)

> These notes come from a systematic visual audit of the live app at `localhost:5173`, walking
> through every page in both dark and light modes, zooming into specific components, and
> cross-referencing the source code.

### What the review got right ✅

- **Generic visual identity** — Confirmed emphatically. In light mode the app is pure clinical
  white. In dark mode it's standard shadcn navy. Zero connection to Mistria.
- **Search result category labels** — Confirmed `text-[10px]`. Readable at desktop width but would
  be rough on a phone.
- **Touch targets** — All concerns validated. Quest cycle buttons are actually worse than the review
  estimated (no size/padding at all). NPC hearts at `p-0.5` around `size-4` = ~20px.
- **ItemRow chevron opacity-0** — Confirmed. Invisible until hover, which doesn't exist on mobile.
- **ExpandableSection missing aria-expanded** — Confirmed.
- **No aria-labels on icon-only buttons** — Confirmed across the entire app. Zero icon-only buttons
  have aria-labels.
- **Sticky header height** — Museum page with world state + filter bar + search + "show completed"
  pushes content well below fold.

### What the review got wrong or overstated ⚠️

- **OverallProgress changing with filter** — INCORRECT. The home page header always shows the
  "Everything" total (e.g., `3% (112/3236)`) regardless of the availability toggle. The per-category
  card counts DO change, but the overall does not. The review's confusion concern doesn't apply to
  the home page.
- **Danger Zone border "very subtle"** — OVERSTATED. The `border-red-200 dark:border-red-900`
  combined with the red "Danger Zone" title text creates sufficient visual distinction in both
  modes. It's actually one of the better visual moments in the settings page.
- **Back button "~28px with padding"** — UNDERSTATED. Back arrows across the app have zero padding.
  They're just a naked `<a>` wrapping a `size-5` icon. Effective target is ~20px, not 28px.

### New observations not in original review

1. **Category progress bars are nearly invisible in dark mode** — The progress bars on the home grid
   cards are gray-on-slightly-darker-gray. You have to look hard to see them. Animals (24/239) and
   Cosmetics (88/253) have visible colored progress, but zero-progress cards show nothing.

2. **Museum has nested expandable sections** — Sets within wings (e.g., Flora > Fall Forage Set > 5
   items). The review didn't discuss this nesting or the "Complete set" shortcut button, which is a
   nice touch for bulk check-off.

3. **NPC dateable vs non-dateable distinction** — Hearts (♡) for dateable NPCs, octagons for
   non-dateable. This is clear and well-done, but the review didn't acknowledge it as a positive.
   The color gradient from violet to rose on heart progression is genuinely delightful.

4. **No motion or micro-interaction** — The only animation in the entire app is the
   ExpandableSection slide (150ms). No page transitions, no check-off feedback, no progress bar
   animation, no hover effects beyond color changes. The app feels static.

5. **Light mode is aggressively clinical** — Pure `#ffffff` white background, thin light-gray
   borders, no shadow depth on cards. The settings page in light mode is the worst offender — 5
   identical white cards on a white background.

6. **The "Timely" filter dramatically reshapes counts** — Museum drops from 268 to 57, Almanac from
   1811 to 99. This is correct behavior, but with no explanation text, a user switching to Timely
   for the first time might think their data disappeared.

7. **Renown page rank list is flat text** — Wood through Mistril as a plain list with minimal
   styling. The current rank gets a background highlight, but completed ranks are just crossed-out
   text. For a feature about "town prestige," it feels underwhelming — this is where a bit of visual
   progression (color gradient, badges, etc.) would shine.

8. **Mines biome display is correct** — "Upper Mines (floors 1–99)" shows proper ranges. The
   review's concern about incorrect biome end floors is not visible in the current data.

---

## Concrete Design Direction

> Moving beyond "what's wrong" to "what it should look like." This section provides specific,
> implementable design tokens and component guidance.

### Color System — Mistria Pastel Palette

Replace the entire shadcn default palette. These OKLch values maintain the existing token structure
but inject warmth and identity.

**Light Mode:**

```css
--background: oklch(0.97 0.008 85); /* warm ivory, not pure white */
--foreground: oklch(0.2 0.02 270); /* deep blue-gray, not pure black */
--card: oklch(0.98 0.005 85); /* slightly warmer than bg */
--card-foreground: oklch(0.2 0.02 270);
--primary: oklch(0.72 0.12 165); /* soft mint green — Mistria's grass */
--primary-foreground: oklch(0.98 0.005 85);
--secondary: oklch(0.82 0.08 350); /* soft rose pink — Mistria's flowers */
--secondary-foreground: oklch(0.25 0.02 350);
--accent: oklch(0.94 0.015 85); /* warm off-white for hover states */
--muted: oklch(0.92 0.01 85); /* warm light gray */
--muted-foreground: oklch(0.45 0.02 270); /* readable warm gray (verify ≥4.5:1 contrast) */
--border: oklch(0.88 0.01 75); /* warm beige border */
--ring: oklch(0.72 0.12 165); /* mint focus ring */
```

**Dark Mode:**

```css
--background: oklch(0.16 0.025 200); /* midnight blue-green, not navy */
--foreground: oklch(0.93 0.01 85); /* warm white */
--card: oklch(0.19 0.02 200); /* slightly lighter than bg */
--primary: oklch(0.78 0.1 165); /* brighter mint for dark bg */
--secondary: oklch(0.8 0.08 350); /* rose, slightly brighter */
--accent: oklch(0.24 0.02 200); /* subtle blue-green for hover */
--muted: oklch(0.22 0.015 200);
--muted-foreground: oklch(0.65 0.02 200); /* readable in dark mode */
--border: oklch(1 0 0 / 12%); /* soft white borders */
```

### Category Color Map

Each category gets a tint used on its card, header, and progress bar:

```css
--cat-museum: oklch(0.72 0.1 65); /* warm amber */
--cat-almanac: oklch(0.72 0.12 145); /* forest green */
--cat-animals: oklch(0.78 0.1 350); /* soft pink */
--cat-npcs: oklch(0.7 0.12 15); /* warm rose-red */
--cat-cosmetics: oklch(0.72 0.1 300); /* lavender */
--cat-skills: oklch(0.7 0.1 230); /* blue */
--cat-renown: oklch(0.78 0.12 85); /* gold */
--cat-quests: oklch(0.7 0.1 185); /* teal */
--cat-mines: oklch(0.55 0.04 260); /* dark slate */
```

Apply these as:

- Progress bar fill color on home cards
- Subtle background tint on category page headers (`oklch(... / 10%)`)
- Icon color on the home grid cards

### Typography

**Decision:** [SN Pro](https://fonts.google.com/specimen/SN+Pro) for all text — body, headings, and
display. Variable font with axes for weight (400–700). Replaces system fonts entirely.

```css
--font-sans: "SN Pro", ui-sans-serif, system-ui, sans-serif;
```

Apply globally — no separate display font needed. SN Pro's rounded letterforms (based on Nunito)
provide warmth and whimsy without sacrificing readability. Variable font file ~20–30KB.

### Motion — Minimum Viable Delight

> ✅ **Implemented** — `app.css`, `checkbox.svelte`, `progress.svelte`, `+layout.svelte`,
> `item-row.svelte`

Three targeted animations (CSS-only, no library needed):

1. **Checkbox check-off** — Brief scale pulse (100ms) on the checkbox when checked. Implemented via
   `{#key checked}` block to re-trigger on every toggle + `@keyframes check-pulse` in `app.css`.
2. **Progress bar fill** — `transition-transform duration-300 ease-out` on the `translateX`-based
   fill indicator. GPU-accelerated (transform, not width).
3. **Page enter** — `animate-in fade-in duration-200` on route change via `{#key page.url.pathname}`
   wrapper in `+layout.svelte`.

**Bonus: completion exit animation** — When an item is checked off with "show completed" off, it
lingers for 800ms (showing checked/strikethrough state), fades out over 200ms, then collapses height
instantly. Implemented via a custom Svelte `out:` transition (`completeOut`) in `item-row.svelte`,
with `recentlyCompleted` sets in almanac and museum pages to hold items in the DOM during the
animation.

### Touch Target Fix Pattern

One reusable class to fix all undersized buttons:

```css
.touch-target {
  position: relative;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

Apply to: back arrows, settings gear, NPC +/- buttons, quest cycle buttons, renown +/- buttons,
ExpandableSection header (increase `py-1.5` to `py-2.5`).

Apply to desktop as well — 44px minimum is good practice for all platforms. On desktop these sizes
feel comfortable rather than oversized.

### Mobile Toolbar Specification

> ✅ **Implemented** (`src/lib/components/toolbar-footer.svelte`)

The single biggest IA change: replace the tall sticky filter/control headers with a compact **sticky
footer toolbar**.

**Category page header** (sticky top, one row, ~44px tall):

```
[← Back]  📦 Category Name         42% (n/m)
```

Minimal: just navigation, identity, and progress.

**Footer toolbar** (sticky bottom, three-slot layout):

```
[🔍 Search]    [🌸 Season + ☀️ Weather]    [📊 Filters]
left-aligned        centered               right-aligned
```

Season and weather were combined into a single bordered pill button that opens one shared panel.
This keeps the toolbar uncluttered and treats world state as a single concern.

**Implemented behavior:**

| Button         | Tap action                                                                                                                  | Visual state                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Search         | Replaces toolbar with full-width text input + Cancel button                                                                 | Active when search is open                                |
| Season+Weather | Opens floating card panel above toolbar with season tiles (4-up grid) and weather tiles (3–4, centered, scoot transition)   | Shows current season + weather icons; crossfade on change |
| Filters        | Opens panel with availability 3-way toggle (world-state pages only) + show-completed switch + Reset button when non-default | Amber tinted background when filters are active           |

**Weather tile names** (short nouns): Sun / Rain / Storm / Breeze (spring/fall only) / Snow (winter)
/ Blizzard (winter heavy).

**Transitions:**

- Season+weather pill icons crossfade when current selection changes
- Weather tiles scoot into position (width-collapse + opacity) when tile count changes
  season-to-season
- Icon and label inside each weather tile crossfade when season changes (e.g., Storm→Blizzard)
- Panel opens/closes with `fly` transition (y: 8, 150ms)

**Divergences from original spec:**

- Labels beneath toolbar buttons were dropped — color/icon context proved sufficient; labels made it
  feel like a nav tab bar
- Season and weather panels were merged into one "World" panel
- Filter active state uses amber background tint instead of a dot indicator
- Show completed uses a blocky Switch component, not a plain checkbox

**Toolbar must respect `env(safe-area-inset-bottom)`** ✅ Implemented.

**Desktop expansion:** Deferred — evaluate after Phase B ships.

**Component:** `src/lib/components/toolbar-footer.svelte` **Store:**
`src/lib/stores/toolbar-state.svelte.ts` (searchOpen, searchQuery)

### Spoiler System — Quest-Locked Items 🔒

Some tracker items are unlocked by completing story quests (skill perks, certain buildings, later
animal unlocks). Showing these items spoils game progression.

**Design:**

- Items locked behind incomplete quests display as **obfuscated**:
  - Name replaced with "???" or a blurred/redacted treatment
  - Checkbox disabled (cannot be checked off)
  - Hint text: _"Continue the story quests to unlock"_
- Once the relevant quest is completed (via save import or manual check-off in Quests category), the
  item reveals normally.
- NOT hack-proof. DOM inspection or data file access is fine — the goal is preventing casual
  spoilers during normal usage.

**Data requirement:** The pipeline must emit a `questGate` field on gated items, mapping to the
quest(s) that unlock them. This is a data pipeline task that blocks the spoiler system UI.

**Data investigation (partial):** Initial research into `fiddle.json` reveals the progression
system:

- **Animals**: Gated by progression flags (e.g.,
  `$.ranching.animals.{animal}.core.progression_requirement` → `repaired_haydens_farm`)
- **Progression flags → quests**: Flags are unlocked by cutscenes tied to story quests (e.g.,
  `$.cutscenes.repair_haydens_barn_pt_2` → flag `repaired_haydens_farm`, triggered by quest
  `repair_haydens_barn`)
- **Fetch quests**: Gated by progression flags, acquired items, or quest requirements (e.g.,
  `$.quests.request_board.request_for_bristles`, `request_for_monster_shell`,
  `request_for_ultimate_hay`)
- **Spell unlocks**: Encoded in cutscenes (`$.cutscenes.full_restore`,
  `$.cutscenes.post_water_seal`, `$.cutscenes.post_earth_seal`, `$.cutscenes.break_fire_seal`) — can
  be automated and removed from the Mines category
- **Quest chains**: Completing a quest can trigger a letter (e.g., `$.letters.repair_the_inn`) with
  a `quest_to_start` field, chaining quests together

The full dependency web needs more exploration (other gating mechanisms likely exist). This is a
separate investigation task — once the dependency graph is mapped, the pipeline can emit `questGate`
fields on gated items and topologically sort quest order.

### Undo Toast for Check-Off Actions ↩️

When a user checks or unchecks an item, show a brief toast notification with an "Undo" button
(Gmail-style "Undo send").

**Behavior:**

- Toast appears at bottom of screen, above the footer toolbar
- Auto-dismisses after ~5 seconds
- Text: "Marked [item name] complete" / "Unmarked [item name]" with "Undo" action
- Tapping "Undo" reverts the state change immediately
- Only one toast visible at a time — subsequent actions replace the current toast
- Use [Sonner](https://sonner.emilkowal.dev/) (already common in shadcn-svelte projects)

**Rationale:** With small touch targets (especially NPC hearts), accidental taps are likely.
Provides a safety net without adding friction to intentional actions.

### Completed Category "Trophy Case" 🏆

> ✅ **Implemented** — `category-card.svelte` + `category-grid.svelte`

When a category reaches 100%, give it special treatment on the home grid.

**Design principles:**

1. **Celebratory**: Gold border/accent, subtle shimmer, completion badge overlay, full-saturation
   category color. Should feel like an achievement.
2. **Out of the way**: Completed categories shouldn't compete for attention with in-progress ones.
   Options to evaluate:
   - Move to a "Completed" section below the active grid
   - Keep in-grid but with a settled/muted treatment (gold accent, no progress bar since it's full)
3. **Trophy case metaphor**: Beautiful and proud, but background. The player's attention should be
   on what's left to do.

**Milestone animation:** When a category first hits 100% (the moment the last item is checked off),
trigger a one-time celebration — confetti burst, color flash, or similar. Also trigger for
section-level completions within a category (e.g., completing a Museum wing). Do NOT trigger for
every individual item check-off.

> ✅ **Implemented** — `canvas-confetti` library with two burst styles:
>
> - `celebrate()`: single center burst for section-level completions (museum wings/sets, almanac
>   groups/sub-categories, per-animal completion, cosmetic slots, quest types, all spells learned,
>   max mine floor)
> - `celebrateCategory()`: dual burst from both sides for full category completion
>
> Celebration logic lives in each category page's event handlers (not in shared components),
> avoiding a Svelte 5 lifecycle issue where conditionally-rendered `ExpandableSection` components
> get destroyed before their `$effect` can fire when `showCompleted` is false.
>
> **Component:** `src/lib/utils/celebrate.ts`

### Welcome Experience — First Visit 👋

When a user visits for the first time (0% progress, no localStorage data), show a welcome
experience.

**Content:**

1. "**Harvest Helper** — Track your Fields of Mistria completion progress"
2. Two paths to start:
   - **"Import from save file"** → navigates to Settings > Import with guidance on finding
     `player.json`
   - **"Start tracking manually"** → dismisses welcome, user starts checking items
3. Brief orientation: 1–2 sentences on how the app works (search → find → check off; set
   season/weather to see what's available now)

**Behavior:**

- Shown once. Dismissal persisted in localStorage.
- NOT a blocking modal. Prefer an inline card/section that replaces the empty category grid until
  dismissed.
- After dismissal, the normal grid shows (with 0% everywhere).
- Guidance should make the UI self-evident rather than requiring "tips" — if the UI needs
  explaining, the UI should be improved instead.

### Text Wrapping for Long Names

Quest names and some item names can be long. All item name text must **wrap to a second line**
rather than truncating or overflowing.

**Affected components:** `ItemRow`, quest list items, search results.

Remove any `truncate`, `whitespace-nowrap`, or `overflow-hidden` on item name elements. Use
`break-words` if needed. Ensure row height adjusts gracefully.

### Design System — Component Codification 🧩

Codify recurring patterns as **reusable components** rather than relying on conventions ("always use
`gap-4`"). If it's a pattern, it should be a component.

**Priority components to extract:**

- **PageHeader**: The one-row sticky header used on all category pages
  (`← Back | Icon + Name | Progress`). Currently duplicated across routes.
- **ToolbarFooter**: The new footer toolbar (shared between home and category pages).
- **TouchTarget**: Wrapper component that ensures 44px minimum hit area for icon buttons.
- ~~**Stepper (+/−)**~~: ✅ Done — `stepper.svelte` with 44px tap target / 32px visual ring (outline
  border on inner `<span>`), `-mx-1.5` optical compensation, slot for middle content. Used by
  Skills, Renown, Mines, NPCs. All toolbar buttons bumped to `min-h-11`; clear search button fixed
  from 32px → 44px.

---

## Summary — Implementation Priorities

The app has excellent **bones**. The implementation plan transforms it from "functional tracker" to
"the companion app that Mistria players love." 🌾

**Phase A — Visual Identity & Core Polish** (highest leverage):

1. ~~🎨 Custom color palette (cream/mint/rose) + warm dark mode (no category colors or seasonal
   tinting yet — establish the base first)~~ ✅ Done — oklch Mistria pastel palette in `app.css`
   with category colors and warm dark mode
2. ~~🔤 SN Pro typeface (replaces system fonts)~~ ✅ Done — loaded via Google Fonts in `app.html`,
   set as `--font-sans`
3. ~~🏷️ Clearer labels for availability toggle + world state context text~~ ✅ Obviated by #5 —
   labels now live in toolbar footer with descriptive text per mode
4. ~~✨ Minimum viable motion (checkbox pulse, progress bar transitions, page fade)~~ ✅ Done

**Phase B — Mobile IA Redesign**:

5. ~~📐 Mobile toolbar footer~~ ✅ Done — `toolbar-footer.svelte`
6. ~~📏 Compact sticky headers (one row only)~~ ✅ Done — `category-header.svelte` single-row sticky
   layout
7. ~~👆 44px touch targets everywhere (desktop too)~~ ✅ Done — button/toggle defaults bumped to
   `h-11`, checkbox wrapped in 44px touch target, expandable headers use `min-h-11`
8. ~~📝 Text wrapping for long item names~~ ✅ Done — `min-w-0 flex-1` allowing natural wrapping
9. ~~📐 Standardized +/− button sizing~~ ✅ Done — unified `Stepper` component with `size-11` touch
   targets

**Phase C — New Features**:

10. ~~👋 Welcome experience (first-visit onboarding)~~ ✅ Done — `welcome-card.svelte`, device-aware
    (mobile→QR scan, desktop→import), dismisses on manual start or reset
11. 🔒 Spoiler system (quest-locked item obfuscation — blocked by data investigation)
12. ~~↩️ Undo toasts (Sonner)~~ ✅ Done — At bottom of screen
13. ~~🏆 Completed category "trophy case" treatment~~ ✅ Done — gold cards + "Completed" section on
    home grid
14. ~~🎉 Milestone celebrations (confetti for section/category completion)~~ ✅ Done —
    `canvas-confetti` in all 9 category page handlers

**Phase D — Accessibility & Cleanup**:

15. ~~♿ ARIA labels on all icon-only buttons + `aria-expanded` on sections~~ ✅ Done — `aria-label`
    added to icon-only buttons (`search-bar`, `transfer-card`, `item-row`); `aria-expanded` added to
    `expandable-section` and `item-row` detail toggles. Toolbar footer and stepper already had
    correct ARIA attributes.
16. ~~🔍 Verify muted-foreground contrast ratio~~ ✅ Done — all combinations pass WCAG AA (4.5:1).
    Light: 7.5:1 on bg, 6.4:1 on muted, 7.7:1 on card. Dark: 6.0:1 on bg, 5.4:1 on muted, 5.7:1 on
    card.
17. ~~🧩 Extract PageHeader, ToolbarFooter, TouchTarget, Stepper components~~ ✅ Done —
    `touch-target.svelte` + `stepper.svelte` (44px tap / 32px visual, `-mx-1.5` optical correction,
    used in Skills, Renown, Mines, NPCs); PageHeader (`category-header.svelte`) and ToolbarFooter
    already existed
18. ~~⚙️ Settings page hierarchy (everyday vs. data management)~~ ✅ Done — 3 sections: "Interface"
    (Theme) → "Getting Started" (Import, Transfer) → "Data Management" (Backup, Danger Zone), with
    dividers in `settings/+page.svelte`

**Prototyping (after Phase A ships):**

- 📦 Category color coding (9 tints) — prototype in isolation
- 🌸 Seasonal theme tinting — prototype in isolation
- Evaluate each separately, then together. May end up using one, both, or neither depending on how
  they interact with the base palette. Start minimal.

---

_Review originally written [date unknown]. Visual audit and code verification performed Feb 2026.
Claims marked "Verified," "Confirmed," or "Corrected" have been cross-referenced against live app
behavior and source code. Decisions and direction confirmed Feb 2026._

## Implementation Audit — Feb 17, 2026

> Systematic codebase audit against every recommendation in this review. Checked source files, not
> just file existence.

### Fully Implemented (Phases A–D)

| #   | Feature                                   | Evidence                                                                                                                                                                                                   |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Warm pastel palette** (cream/mint/rose) | `app.css` — full oklch token replacement in `:root` and `.dark`                                                                                                                                            |
| 2   | **Category color coding** (9 tints)       | `app.css` — `--cat-museum` through `--cat-mines` in both modes; applied to card icons, progress bars, hover borders in `category-card.svelte`                                                              |
| 3   | **Warm dark mode**                        | `--background: oklch(0.16 0.025 200)` — midnight blue-green, not cold navy                                                                                                                                 |
| 4   | **SN Pro typeface**                       | Loaded via Google Fonts in `app.html` (400/500/600); set as `--font-sans`                                                                                                                                  |
| 5   | **Toolbar footer**                        | `toolbar-footer.svelte` — search, world-state panel (season+weather merged), filters panel with availability toggle + show-completed switch. Route-aware, safe-area-inset-bottom. Used in `+layout.svelte` |
| 6   | **Compact sticky headers**                | `category-header.svelte` — single row: `[← Back] [Icon] [Name] [%] [(n/m)]`                                                                                                                                |
| 7   | **44px touch targets everywhere**         | `touch-target.svelte` + `stepper.svelte` (size-11). Checkbox button, toolbar buttons, back arrow, expandable headers all min-h-11/min-w-11                                                                 |
| 8   | **Standardized +/− buttons**              | `stepper.svelte` — 44px tap / 32px visual ring, `-mx-1.5` optical compensation. Used by Skills, Renown, Mines, NPCs                                                                                        |
| 9   | **Checkbox pulse animation**              | `@keyframes check-pulse` in `app.css`; triggered via `{#key checked}` in `checkbox.svelte`                                                                                                                 |
| 10  | **Progress bar transitions**              | `transition-transform duration-300 ease-out` in `progress.svelte`                                                                                                                                          |
| 11  | **Page fade-in**                          | `animate-in fade-in duration-200` in `+layout.svelte`, keyed on `page.url.pathname`                                                                                                                        |
| 12  | **Welcome experience**                    | `welcome-card.svelte` — device-aware (mobile→QR scan, desktop→import), localStorage-persisted dismissal                                                                                                    |
| 13  | **Undo toasts**                           | `svelte-sonner` installed; `undo-toast.ts` with 5s auto-dismiss. Used on all checkbox pages + quests                                                                                                       |
| 14  | **Trophy case**                           | `category-card.svelte` — gold border/amber accent, trophy icon replaces category icon. `category-grid.svelte` separates completed into own section                                                         |
| 15  | **Confetti celebrations**                 | `canvas-confetti` installed; `celebrate.ts` — `celebrate()` for sections, `celebrateCategory()` for full categories. Wired in all 9 category page handlers                                                 |
| 16  | **ARIA labels**                           | `aria-label` on all icon-only buttons (back, settings, search, clear, stepper, checkbox, expand, toolbar, transfer). `aria-expanded` on expandable-section and item-row details                            |
| 17  | **Settings hierarchy**                    | 3 sections: "Interface" → "Getting Started" → "Data Management" with dividers                                                                                                                              |
| 18  | **Availability labels rewritten**         | Toolbar uses "Seasonal" / "Accessible" / "All items" (new labels)                                                                                                                                          |
| 19  | **Text wrapping**                         | `min-w-0 flex-1` pattern across `item-row`, `category-card`, `skill-row`                                                                                                                                   |
| 20  | **Minimum text size**                     | Zero instances of `text-[10px]` remain in `src/`. Smallest is `text-xs` (12px)                                                                                                                             |
| 21  | **Completion exit animation**             | Custom `out:` transition in `item-row.svelte` — 800ms linger, 200ms fade, height collapse                                                                                                                  |
| 22  | **Panel transitions**                     | `fly` transitions on toolbar panels; crossfade on season/weather icons; scoot on weather tile reorder                                                                                                      |

### Not Implemented

| #   | Feature                            | Status      | Notes                                                                                                                                              |
| --- | ---------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Spoiler system (quest-gate UI)** | Blocked     | Data types (`questGate?: QuestId[]`) and pipeline extraction exist, but no UI obfuscation. Blocked on completing the full quest dependency mapping |
| 2   | **Progress ring on home page**     | ✅ Done     | SVG ring with animated arc + percentage label in `overall-progress.svelte`                                                                         |
| 3   | **Skill tier color progression**   | ✅ Done     | Segmented progress bar with 4 tier sections using primary color. Current tier is full opacity; earlier tiers fade back progressively               |
| 4   | **Skill tier label removal**       | ✅ Done     | Removed invented tier names (`Novice`, `Apprentice`, etc.). Game doesn't label tiers to the player, so labels are omitted                          |
| 5   | **Town rank visual treatment**     | Not started | Flat text list with `line-through` for completed ranks. No colored stars or visual progression                                                     |
| 6   | **Seasonal theme tinting**         | Not started | No dynamic CSS property updates based on selected season. Deferred per plan                                                                        |

### Minor Gaps / Stale Code

All resolved ✅

| Issue                                        | Detail                                                                                                                                                          | Status                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Quest toggle missing `aria-label`**        | Quest page 3-state cycle buttons have `title` but no `aria-label`. Title attributes aren't announced reliably on mobile screen readers                          | ✅ Fixed — replaced `title` with `aria-label`                             |
| **Stale `availability-toggle.svelte`**       | Old standalone component still has "Timely / Available / Everything" labels. Appears unused now that the toolbar handles this, but still exists in the codebase | ✅ Fixed — deleted unused component                                       |
| **Category header shows redundant progress** | Displays both `42%` and `(n/m)` simultaneously. Home cards show one or the other responsively (`%` on mobile, `n/m` on desktop). Minor inconsistency            | ✅ Fixed — now responsive (`%` mobile, `n/m` desktop) matching home cards |

### Phase Status Summary

| Phase           | Description                        | Status                                                                                                     |
| --------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **A**           | Visual Identity & Core Polish      | **Complete** — palette, typography, labels, motion                                                         |
| **B**           | Mobile IA Redesign                 | **Complete** — toolbar footer, compact headers, touch targets, text wrapping, stepper                      |
| **C**           | New Features                       | **Mostly complete** — welcome, undo toasts, trophy case, confetti all done. Spoiler system blocked on data |
| **D**           | Accessibility & Cleanup            | **Complete** — ARIA labels, contrast verified, components extracted, settings hierarchy                    |
| **Prototyping** | Category colors + seasonal tinting | Category colors shipped. Seasonal tinting not started                                                      |

---

## Open Questions ❓

Resolved questions have been incorporated into the spec sections above. Remaining open items:

1. **Spoiler quest mapping**: Partial investigation done (see data findings in the
   [Spoiler System](#spoiler-system--quest-locked-items-) spec). The full dependency web needs more
   exploration — other gating mechanisms likely exist beyond progression flags, cutscenes, and
   letters. This is a separate investigation task that blocks the spoiler UI.

2. **Town Rank visual treatment**: Reference image shows 11 color-coded star icons (Wood through
   Mistril, Lv.0–100) — see `Renown_Chart.png` in Dropbox. Direction: incorporate these colored
   stars into the rank display, potentially as icons alongside rank names. Each level has a distinct
   star color which provides the visual progression the current flat text list lacks. Specific
   layout TBD.

3. **Color prototyping plan**: Once the base palette (Phase A) ships, prototype category colors and
   seasonal tinting separately, then together. Final decision on one, both, or neither depends on
   visual evaluation against the new base palette. At minimum, the world state season marker should
   show a nice color even before any broader tinting.

4. ~~**Completed category layout**~~: Resolved — separate "Completed" section below the active grid,
   with gold border/accent trophy treatment on cards. Trophy icon replaces category icon, progress
   bar becomes solid amber.

---

## Out of Scope (Separate Tasks) 📋

These items came up during review but are not part of the UX overhaul:

1. **Extract PageHeader component** — The sticky page header pattern is duplicated across all
   category routes. Should be extracted into a shared component. (This naturally happens as part of
   the toolbar implementation in Phase B.)

2. **Story quest ordering** — Quests have a narrative order. If we can determine it from the data,
   sort them accordingly and consider hiding upcoming quests as spoilers.

3. **User feedback mechanism** — Need a way for users to report issues or send feedback. Plan is to
   move the app to its own domain and set up a feedback system with triage (UI bugs vs. data errors
   vs. general feedback).
