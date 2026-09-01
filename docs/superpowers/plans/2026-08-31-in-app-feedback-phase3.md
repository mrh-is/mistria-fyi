# In-app feedback phase 3: richer context

## Context

Phase 1 shipped the core feedback loop (panel, endpoint, GitHub issue creation). Phase 2 added the
element picker and `TrackerRow` registration. Phase 3 completes the feedback feature by adding
save-data attachment and opting additional component types into the reportable system.

The spec's third phase 3 item (client-side screenshot capture) was evaluated during spec design and
deferred. The spec already documents this decision in §2 ("No client-side screenshots"). Phase 3
will add a note to the plan explicitly recording that it was omitted from this phase by mutual
decision, not merely deferred.

## 1. Save-data attachment

### Panel UI (`feedback-panel.svelte`)

Add a toggle (switch or checkbox) between the email field and the auto-context line:

- Label: "Include my progress data (helps us reproduce issues)"
- Default: off
- When toggled on, show an explanatory note: "This sends your tracked completion state (items
  checked off, skill levels, etc.). It doesn't include any personal information. **This data will be
  publicly visible.**"
- The toggle state is part of the draft (preserved on dismiss, cleared on route change or successful
  submit).

When enabled, serialize only the `completed` portion of `UserState` using the existing `serialize()`
approach (Sets as sorted arrays, Records as plain objects). This means reading
`userState.state.completed` and building the same serialized shape as the `completed` key from
`serialize()`, but without `availabilityMode`, `showSpoilers`, `worldState`, or `version`. Cap it
client-side: if `JSON.stringify` exceeds 50 KB, don't include it and warn the user.

Include `saveData` in the POST payload.

### Endpoint (`+server.ts`)

Add `saveData` validation:

- If present, must be a non-null object (not an array).
- Stringified size must not exceed 50 KB.
- No deeper structural validation needed; it's opaque game-progress data.
- Unknown top-level keys in the main payload are already implicitly allowed (not checked); add
  `saveData` to the `FeedbackPayload` interface.

Add a `<details>` block to the issue body when `saveData` is present:

```markdown
<details>
<summary>Save data (user-provided progress snapshot)</summary>

⚠️ This data was voluntarily attached by the reporter.

\`\`\`json {...serialized data...} \`\`\`

</details>
```

### Tests

- Panel: toggle visibility, explanatory text appears, `saveData` included in payload when on,
  omitted when off, draft preservation includes toggle state.
- Endpoint: valid `saveData` accepted, oversized rejected (400), non-object rejected, `<details>`
  block appears in issue body, absent when not provided.

## 2. Additional reportable components

The element picker currently only highlights `TrackerRow` instances. Phase 3 opts in four more
component types.

### SkillRow (`skill-row.svelte`)

Add the `reportable` attachment to the outer `<div>` with:

- `category: "skill"`
- `displayName: name` (the skill name prop)
- `entityId: id` (the `SkillId`)
- `extra: { level }` (current skill level)
- `page` from `$app/state`

This requires importing `getFeedbackContextOrFallback` and `page`, adding the `{@attach ...}` to the
outer div, and computing the reportable metadata as a `$derived`.

### Stepper (mines floor, renown)

`Stepper` is a generic UI primitive; it shouldn't own feedback registration. Instead, the parent
components that use `Stepper` for domain concepts will register their wrapping elements.

**Mines floor stepper** (`mines-content.svelte`): The `<div>` wrapping the floor stepper (around
line 140–188) gets a `reportable` attachment with:

- `category: "mines"`
- `displayName: "Floor"` (or the current biome name)
- `extra: { floor: currentFloor, biome: currentBiome().name }`
- `page` from `$app/state`

**Renown stepper** — check if there's a renown stepper in the codebase. If not present, skip.

### NPC sections (`dates-section.svelte`, `quests-content.svelte`)

`dates-section.svelte` renders date rows per-NPC, which are already TrackerRows (registered in phase
2). The NPC _section_ headers are `ExpandableSection` instances, covered below.

For quests, NPC-grouped sections similarly use `ExpandableSection`. The NPC-level registration
happens via `ExpandableSection` below.

### ExpandableSection (`expandable-section.svelte`)

Add optional reportable props to `ExpandableSection`:

- `reportCategory?: string`
- `reportEntityId?: string`
- `reportExtra?: Record<string, number | string>`

When `reportCategory` is provided, attach `reportable` to the outer `<div>`. This keeps the
component opt-in: existing call sites that don't pass report props remain unchanged.

Representative call sites to update:

- **Mines** sections ("Floors", "Spells"): `reportCategory="mines"`, `reportEntityId="floors"` /
  `"spells"`
- **NPC date sections** in `dates-section.svelte`: pass the NPC name and ID
- **Quest NPC sections** in `quests-content.svelte`: pass the NPC name and ID
- **Museum set sections** in `museum-content.svelte`: pass set name and ID
- **Recipe category sections** in `recipes-content.svelte`: pass category name
- **Animal subcategory sections**: already uses `ExpandableSection` inside
  `animal-subcategory.svelte`
- **Cosmetic sections** in `cosmetics-content.svelte`
- **Pet collectible sections** in `pet-collectibles-section.svelte`

The point is lightweight: if reportCategory isn't passed, no attachment is created.

### Tests

- `SkillRow`: registration metadata (category, entityId, level in extra). Client test.
- `ExpandableSection`: registration when report props are provided, no registration when absent.
- Mines floor wrapper: registration metadata.

## 3. Screenshot omission documentation

Update the phase 3 plan (this document, committed as the plan) to explicitly record that screenshot
capture was evaluated and omitted. The spec's §2 already explains the technical rationale (iOS
Safari reliability gaps with every viable library). Add a short "Omitted" section to the plan noting
the decision was made before phase 3 implementation.

## File changes

| File                                                          | Change                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| `src/lib/components/feedback-panel.svelte`                    | Save-data toggle, serialization, payload inclusion     |
| `src/lib/components/feedback-panel.client.test.ts`            | Save-data toggle and payload tests                     |
| `src/routes/api/feedback/+server.ts`                          | `saveData` validation, `<details>` block in issue body |
| `src/routes/api/feedback/feedback.test.ts`                    | `saveData` endpoint tests                              |
| `src/lib/components/skill-row.svelte`                         | Reportable attachment                                  |
| `src/lib/components/expandable-section.svelte`                | Optional report props, conditional attachment          |
| `src/lib/components/mines-content.svelte`                     | Floor stepper wrapper reportable attachment            |
| `src/lib/components/dates-section.svelte`                     | Pass report props to ExpandableSection                 |
| `src/lib/components/quests-content.svelte`                    | Pass report props to ExpandableSection                 |
| `src/lib/components/museum-content.svelte`                    | Pass report props to ExpandableSection                 |
| `src/lib/components/recipes-content.svelte`                   | Pass report props to ExpandableSection                 |
| `src/lib/components/animal-subcategory.svelte`                | Pass report props to ExpandableSection                 |
| `src/lib/components/cosmetics-content.svelte`                 | Pass report props to ExpandableSection                 |
| `src/lib/components/pet-collectibles-section.svelte`          | Pass report props to ExpandableSection                 |
| `src/lib/components/skills-content.svelte`                    | No change (SkillRow handles itself)                    |
| New: skill-row client test                                    | SkillRow registration tests                            |
| New: expandable-section client test                           | ExpandableSection registration tests                   |
| `docs/superpowers/plans/2026-08-31-in-app-feedback-phase3.md` | This plan                                              |

## Omitted: client-side screenshot capture

The spec (§2, "No client-side screenshots") evaluated and deferred screenshot attachment. Before
phase 3, this was explicitly decided to omit rather than defer: every viable library
(`html-to-image`, `html2canvas`, `SnapDOM`) has iOS Safari reliability gaps, and the app's primary
audience is mobile. The structured metadata from the picker (entity ID, display name, category,
page) is more actionable for a data-accuracy tracker than a screenshot of a row. If screenshot
demand emerges from real feedback submissions, spike it separately.

## Verification

1. `pnpm run lint:fix`
2. `pnpm run lint`
3. `pnpm run check`
4. `pnpm run test`
5. `pnpm run build`

All must pass with zero errors and zero warnings.
