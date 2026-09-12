# Category migration and specialized pages implementation plan

- **Issue:** #130
- **Phase:** 5
- **Design:** `docs/superpowers/specs/2026-09-11-category-migration-specialized-pages-design.md`
- **Status:** Approved

## Outcome

Apply the Field Guide’s section grammar across ordinary tracker categories, replace the existing
Townsfolk, Skills, Mines, and Renown presentations with the approved specialized records, and keep
Everything compact through shared component variants. Add the application-side NPC icon contract and
fallback now; accept the deterministic extraction and generated icon commit from the Gaming PC
before Phase 5 is considered complete.

The work remains stacked on Phase 4 PR #223. The Phase 5 pull request targets
`130-home-category-frame` until the lower stack is merged.

## Ownership boundary

### Current worktree

This session owns the specification, plan, application components, pure relationship projection,
application-side icon contract, component tests, and browser accessibility coverage. Its file set
includes `src/lib/`, `src/routes/`, `tests/accessibility/`, and the two Phase 5 documents.

`src/lib/types/tracker-data.ts` gains an optional NPC icon-sprite field so the application can
render the deterministic icon when present and retain the approved initial fallback when an icon is
absent. The field may become required after the generated dataset proves complete, but optionality
is the safe integration state for tests, partial fixtures, and stacked review.

### Gaming PC

The Gaming PC owns:

- parsing each NPC’s `small_icon_sprite` from `pipeline/input/assets/fiddle/npcs/*.toml`;
- emitting that identifier into generated NPC tracker data;
- extending sprite extraction to include the required NPC sprite identifiers;
- pipeline tests for complete identifier discovery, deterministic extraction, and missing-sprite
  failure behavior;
- regenerating `src/lib/data/tracker-data.json`; and
- committing the resulting optimized NPC images under a dedicated static asset directory.

That commit should avoid application UI files, the shared type file, and Phase 5 documents. If the
pipeline architecture requires a small shared-signature edit outside its assigned files, the Gaming
PC should rebase first and make the narrowest compatible change rather than reverting Phase 5 work.

The application uses the sprite identifier supplied by generated data and falls back to initials if
the image request fails, so the UI branch remains runnable before the Gaming PC commit arrives.

## File map

### Shared components

- `src/lib/components/expandable-section.svelte`: field-guide divider, nested treatment, aligned
  count, progress rule, and unchanged disclosure semantics.
- `src/lib/components/expandable-section.test.ts`: structural and semantic divider coverage.
- `src/lib/components/stepper.svelte`: only change if a named density or record-layout hook is
  needed; retain its existing public behavior.
- `src/lib/components/specialized-record-stack.svelte`: shared white-sheet adjacency and pointer
  density for non-tracker record lists, if the implementations demonstrate a real common contract.
  Do not introduce this abstraction preemptively.

### Townsfolk

- `src/lib/engine/relationships.ts`: pure relationship-presentation projection and action types.
- `src/lib/engine/__tests__/relationships.test.ts`: complete level, relationship, child-choice, and
  marriage-warning matrix.
- `src/lib/components/npc-record.svelte`: one compact roster record, spoiler state, icon fallback,
  display-only progress marks, stepper, and contextual action row.
- `src/lib/components/npc-record.client.test.ts`: interaction and accessible-state coverage.
- `src/lib/components/npc-alphabet-index.svelte`: direct activation, keyboard focus movement, and
  progressive pointer scrubbing.
- `src/lib/components/npc-alphabet-index.client.test.ts`: represented initials, activation,
  keyboard, and pointer behavior.
- `src/lib/components/npc-relationship-picker.svelte`: remove after its behavior moves into the
  contextual record action row.
- `src/routes/(category)/npcs/+page.svelte`: roster composition, alphabet anchors, category
  completion celebration, and removal of Dates.
- `src/lib/types/tracker-data.ts`: optional application-side NPC icon sprite identifier.

### Skills

- `src/lib/components/skill-row.svelte`: ledger-row material, four-part level rule, formatted count,
  direct editing, and pointer-aware controls.
- `src/lib/components/skills-content.svelte`: full and compact ledger composition.
- `src/lib/components/skill-row.client.test.ts`: direct edit, stepper, completed state, progress
  segments, and compact variant.
- `src/lib/components/skill-row.test-harness.svelte`: update only as needed for the new public
  props.

### Mines

- `src/lib/components/mine-floor-record.svelte`: reusable full survey and compact floor record.
- `src/lib/components/mine-floor-record.client.test.ts`: clamping, direct editing, biome boundaries,
  persistent segment divisions, and compact behavior.
- `src/lib/components/mines-content.svelte`: compose the new floor record and preserve shared spell
  rows and source filtering.

### Renown

- `src/lib/components/renown-current-record.svelte`: current-rank impression, overall rule, count,
  direct editing, and compact variant.
- `src/lib/components/renown-current-record.client.test.ts`: editing, clamping, transition between
  ranks, completion celebration, and compact behavior.
- `src/routes/(category)/renown/RankCard.svelte`: rename to a kebab-case rank-record component and
  implement completed, current, upcoming, and spoiler states.
- `src/routes/(category)/renown/+page.svelte`: compose the current record and contiguous register.
- `src/routes/all/RenownSection.svelte`: use the compact current-rank record.

### Everything and browser coverage

- `src/routes/all/NpcsSection.svelte`: reuse compact NPC records without the alphabetic index.
- `src/routes/all/SkillsSection.svelte`: use compact skill records.
- `src/routes/all/MinesSection.svelte`: use the compact mine-floor record and existing spell rows.
- `tests/accessibility/semantics.spec.ts`: specialized meter names, relationship state, and spoiler
  semantics.
- `tests/accessibility/keyboard.spec.ts`: roster order, alphabet index, contextual actions, and
  direct numeric editing.
- `tests/accessibility/geometry.spec.ts`: 320-pixel reflow and pointer-target assertions for every
  specialized record.
- Add a focused Phase 5 browser specification only if stateful flows would make the existing files
  unwieldy.

File names may consolidate during implementation when an existing component already owns the exact
responsibility. Any consolidation must preserve the ownership boundary and cannot move business
logic into page compositors.

## Phase 1: Commit approved documents

After plan approval, change this plan’s status to “Approved”, run Prettier and the documentation
spelling check on the two Phase 5 documents, and commit only those documents. The commit uses the
repository owner’s configured identity and ends with:

`Co-Authored-By: Codex <codex@openai.com>`

No implementation or generated file may enter this commit. Confirm the staged file list before
committing.

## Phase 2: Establish shared-section contracts

Extend the expandable-section tests first. Assert:

- one semantic disclosure button retains `aria-expanded` and controls the content region;
- the visible count uses spaced `X / Y` text while its accessible name remains concise;
- the progress rule receives a bounded percentage and is hidden from assistive technology;
- nested sections expose an explicit depth state or CSS variable rather than depending on arbitrary
  descendant selectors; and
- empty, filtered, completed, open, and closed sections preserve their current behavior.

Run the focused test and confirm the new structural expectations fail. Then implement the shared
divider with category-color inheritance, mono count alignment, nested indentation, and a bottom
progress rule. Keep tracker-row composition and filtering untouched.

Review Almanac, Animals, Cosmetics, Museum, Quests, and Recipes at phone and desktop widths before
continuing. Correct shared geometry in the component rather than adding category-specific patches.

## Phase 3: Model relationship presentation

Add a table-driven relationship-engine test before changing the Townsfolk UI. Cover:

- levels below eight;
- the undecided choice at eight through twelve hearts;
- platonic state;
- dating before and at ten hearts;
- engaged state and its marriage warning;
- married state before and after both household choices;
- another existing marriage closing the current NPC’s romantic actions; and
- labels for every persisted relationship state.

Move the presentation projection into `src/lib/engine/relationships.ts`. It returns display label,
prompt, optional warning, and the exact next actions. It does not mutate state or import Svelte.

Keep `userState.setNpcRelationship` as the mutation boundary. Add or retain store tests proving that
marriage normalizes other romantic paths and that the child choice remains serialized.

## Phase 4: Build the Townsfolk record

Create failing client tests for one known dateable NPC, one known non-dateable NPC, one unmet NPC,
and every contextual relationship action. Assert:

- character image and fallback behavior;
- visible name, status, and formatted birthday for known NPCs;
- obscured identity, hidden birthday, subdued icon, and empty marks for unmet NPCs;
- twelve non-interactive marks with one grouped accessible level value;
- decrement and increment labels, disabled boundaries, and state updates;
- exactly the next available relationship action rather than all states;
- the marriage warning’s association with “Record marriage”; and
- focus stability after a state transition replaces the decision row.

Implement `npc-record.svelte` and recompose the category page as a semantic roster. Remove
`NpcRelationshipPicker` and Dates only after the new tests cover their required replacement
behavior. Preserve category-completion celebration and the global completed-content preference.

The icon component builds its static URL from the generated identifier, uses an empty `alt`, and
switches to the initial fallback after an image error. Do not fetch remote images.

## Phase 5: Add alphabetic navigation

Create a client-test harness with repeated and missing initials. Prove that the index:

- contains only represented initials in alphabetical order;
- gives each letter an accessible destination name;
- moves focus to the first matching record;
- supports Enter and Space through native button behavior;
- updates while pointer-scrubbing across represented letters;
- does not begin scrubbing from outside the index; and
- selects immediate rather than smooth scroll behavior under reduced motion.

Implement the index as a visually quiet, vertically centered viewport-fixed rail. Condense its
letter spacing to fit between the header and toolbar, and never give it an independent scroll area.
Use element geometry only during an active pointer gesture, and retain direct activation as the
complete interaction. Avoid a global pointer listener when no scrub is active.

Add the index only to the dedicated Townsfolk page. Everything retains ordinary document flow.

## Phase 6: Rework Skills

Update `skill-row.client.test.ts` first for the ledger contract. Assert four fifteen-level segments,
bounded fill, spaced `X / 60`, direct-edit commit and cancellation, stepper boundaries, completed
presentation, and the compact variant.

Rework `skill-row.svelte` into one white-sheet ledger row. Keep level computation and celebration
behavior, but replace generic rounded spacing with shared record geometry and a category-blue
segmented rule. The visual segments remain hidden from assistive technology; the grouped control
announces the level once.

Update the dedicated Skills page and Everything section to use the full and compact compositions. Do
not fork level mutation or progress math between them.

## Phase 7: Build the mine survey

Add failing tests for biome segment proportions derived from representative tracker data, persistent
segment divisions, biome boundaries, maximum floor, direct numeric clamping, decrement and increment
labels, and the compact variant.

Extract the floor UI from `mines-content.svelte` into `mine-floor-record.svelte`. Compute segment
widths and per-biome fill from the supplied biome ranges and maximum, preserving visible divisions
through completed and unreached depth. The rule is not interactive and exposes no slider role. Keep
the editable number and Stepper as the sole mutation path.

Recompose Mines and its Everything section with the full and compact variants. Verify that spell
source filtering, spoiler guards, tracker-row expansion, and celebrations remain unchanged.

## Phase 8: Build the Renown register

Add failing tests for current-rank derivation, within-rank count, direct editing, stepper
boundaries, maximum state, completed/current/upcoming rows, partially filled current mark, and
spoiler reveal.

Extract the current-rank UI into a reusable full and compact component. Replace the generic accent
card and progress component with the pressed seal, amber rule, permanently visible numeric input,
and existing stepper controls. Rename `RankCard.svelte` to a kebab-case record component and render
all ranks as one contiguous register.

Keep rank-specific colors inside marks only. Use category amber for current state, progress, focus,
and the pressed print mark. Reuse the compact current record in Everything.

## Phase 9: Integrate the Gaming PC commit

Push the Phase 5 branch and open the stacked pull request once the application implementation is
coherent and locally verified with fallbacks. The Gaming PC rebases on the current remote branch,
implements only its owned pipeline and generated-asset files, runs the pipeline-specific matrix, and
pushes one attributed commit to the same branch.

After that commit lands, this session:

- pulls or fast-forwards the worktree;
- reviews the data and asset diff without reading the full generated JSON;
- checks that all 34 NPC records have nonempty sprite identifiers;
- checks that every referenced static image exists and has deterministic dimensions and format;
- runs the focused NPC and pipeline tests; and
- reviews known and spoilered NPC icon rendering in both themes.

If the Gaming PC commit is not ready when the UI is ready, leave the PR in draft and record the
missing asset commit as the only incomplete acceptance criterion. Do not mark Phase 5 complete with
initial fallbacks as the production state.

## Phase 10: Browser and visual verification

Extend browser tests before the final matrix. At minimum, verify:

- all changed pages pass axe checks in light and dark themes;
- tab order follows visible order in the Townsfolk roster and relationship decision row;
- alphabet activation moves focus to the correct record;
- every specialized numeric control works by keyboard;
- spoilered Townsfolk and ranks do not leak hidden names through accessible text;
- phone record controls meet the 44-pixel contract, while the compact alphabet rail remains within
  the viewport and meets the 24-pixel target minimum when space permits;
- all four specialized pages reflow at 320 CSS pixels without horizontal page overflow; and
- reduced motion disables smooth alphabet scrolling and progress transitions.

Perform visual checkpoints at phone and desktop widths in both themes. Review ordinary-category
section rhythm, dense Townsfolk records, long NPC and skill names, every relationship decision,
biome boundaries, rank transitions, completed states, and floating-toolbar overlap.

## Phase 11: Complete verification and delivery

Run the complete matrix once after implementation and Gaming PC integration:

1. `pnpm run lint:fix`
2. `pnpm run lint`, with zero errors and zero warnings
3. `pnpm run check`, with zero errors and zero warnings
4. `pnpm run test`
5. `pnpm run test:pipeline:assets` because the NPC extractor changes
6. `pnpm run pipeline -- pipeline/input/assets --sprites` on the Gaming PC, followed by a clean
   deterministic diff check
7. `pnpm run build`
8. `pnpm playwright test tests/accessibility`

Review `git status`, `git diff --check`, the commit range against `130-home-category-frame`, and the
pull request diff. Commit application work with the repository owner’s identity and the Codex
co-author trailer. The Gaming PC commit uses the agent attribution of the agent that authors it.

Open or update the stacked PR with a one-line-per-paragraph GitHub body, `Agent: codex`, the
`agent: codex` label, and a reference to issue #130 Phase 5. Keep the issue’s existing
`status: in progress` and `agent: codex` labels through review.
