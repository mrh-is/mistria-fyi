# Category migration and specialized pages

- **Issue:** #130
- **Phase:** 5
- **Status:** Approved

## Goal

Carry the Field Guide’s established paper, print, color, sprite, progress, and interaction language
through every tracker category. Ordinary collection categories should remain compact compositions of
shared sections and tracker rows. Townsfolk, Skills, Mines, and Renown should receive focused record
types that reflect their distinct progress models without becoming isolated visual systems.

The result should feel like one working reference book whose page grammar adapts to collections,
relationships, measured progression, depth, and ranks.

## Scope

Phase 5 covers:

- the shared expandable-section treatment used by Almanac, Animals, Cosmetics, Mines, Museum,
  Quests, and Recipes;
- the approved compact Townsfolk roster and relationship progression;
- compact skill-level records;
- a mine-floor survey record above the existing spell rows;
- a current-rank impression and rank register for Renown;
- corresponding compact compositions in Everything where specialized content is reused; and
- responsive, keyboard, semantic, spoiler, motion, and contrast behavior for every changed surface.

Phase 5 does not redesign search, visibility filters, settings, feedback, or other overlays. Those
remain Phase 7 work. It also does not replace category or utility icon proxies, which remain Phase 6
work.

## Shared page grammar

### Ordinary categories

Almanac, Animals, Cosmetics, Museum, Quests, and Recipes already use the approved tracker-row paper
stack. They do not need independent page designs.

Their expandable sections become shared field-guide dividers:

- The disclosure target remains a semantic button with the existing expanded state and focus
  behavior.
- The section name uses Newsreader at body scale rather than display scale.
- The completion count uses DM Mono and the established `X / Y` spacing.
- A quiet category-colored progress rule forms the divider’s bottom edge. It has a pale full-width
  track and a solid completed portion.
- Nested sections use a smaller indentation and lighter rule rather than cards, additional borders,
  or progressively smaller type.
- Expanded content begins close to the divider. Tracker rows retain responsibility for their own
  white and brown paper geometry.
- Completed sections may use muted ink, but remain operable while completed content is visible.

The divider is the only new shared visual treatment for ordinary categories. Their row content,
source reveal, filtering, spoiler behavior, and completion semantics do not change.

### Specialized records

Townsfolk, skill, mine-floor, and rank records reuse the same material vocabulary:

- white record paper against the off-white page;
- one-pixel hairlines and the shared small elevation token;
- category color used for progress, state, and print marks rather than large opaque panels;
- Instrument Serif reserved for page and major current-state labels;
- Newsreader for names and explanatory text;
- DM Mono for counts, levels, floor ranges, birthday dates, and compact status labels; and
- touch-safe controls by default, with the established fine-pointer density reduction on desktop.

They do not imitate the tracker row’s source corner when no secondary source sheet exists.

## Townsfolk roster

### Record composition

The Townsfolk page follows the approved compact roster direction. NPCs are sorted alphabetically and
rendered as contiguous white records rather than cards. Each record contains:

- a 44 × 44 character icon;
- the NPC name and current relationship status when applicable;
- a season icon and birthday in compact `SEA DD` form;
- twelve display-only relationship marks;
- decrement and increment controls adjacent to the marks; and
- one contextual decision row when relationship progression requires a choice.

Dateable NPCs use hearts. Non-dateable NPCs use octagons. Filled marks retain the game-inspired
twelve-color sequence already present in the application. Empty marks use a quiet outline. The marks
communicate state but are not buttons; only the adjacent controls change the level.

On phone layouts, marks wrap into two rows of six. On desktop, all twelve remain on one line. Phone
decrement and increment controls remain at least 44 × 44 CSS pixels. Fine-pointer desktop controls
may reduce to 32 × 32 CSS pixels.

The current Dates section is removed from the Townsfolk page because dates are tracked in Almanac.
Location, gift history, and a separate birthday summary are not introduced.

### Character icons

Production NPC icons come from each NPC’s `small_icon_sprite` field in the installed game data. The
pipeline exposes that sprite identifier in the shared `Npc` contract and extracts the corresponding
image through the same local, deterministic asset workflow used for item sprites. The application
does not fetch or ship community-wiki images.

The icon is decorative beside the NPC’s visible name and therefore uses an empty alternative. An
unmet NPC uses the subdued spoiler treatment. If a generated icon is temporarily absent, the record
renders a stable rose-tinted initial placeholder so development, tests, and a partially assembled
stack remain usable.

The Gaming PC contributes the pipeline and generated-asset commit to the same Phase 5 branch because
the sprite archive is available there. That commit owns NPC sprite discovery, extraction, generated
tracker data, and the resulting static NPC images. It must not alter the approved roster layout or
relationship behavior.

### Spoilers

An unmet NPC retains a stable record position and alphabetic anchor. The name is obscured, the
birthday is hidden, the icon is subdued, relationship status is omitted, and all progress marks are
empty. Revealing the spoiler uses the existing explicit spoiler convention and does not change the
stored relationship level.

### Relationship decisions

Relationship status appears as display text beneath the NPC name. The interface does not render a
persistent set of selectable state pills.

Only the next relevant decision appears:

- At eight hearts with no chosen path, show “Best friends” and “Start dating”.
- At ten hearts while dating, show “Record proposal”.
- While engaged, show “Record marriage” with a concise warning that marriage closes every other
  romantic path.
- Once married and household preference is undeclared, show “Kids” and “Child-free”.
- After the household choice, show only the resulting relationship label.

The projection from stored level, relationship, and child choice to visible label, prompt, warning,
and actions is a pure domain function. Manual correction remains available through save import or
future correction surfaces; the roster models forward game progression.

Recording marriage continues to use the store’s existing normalization behavior, which converts
other romantic paths to best friends and closes new romantic paths. The marriage warning is visible
before activation and associated with the action for assistive technology.

### Alphabetic index

A vertically centered alphabetic index sits at the roster’s inline end and includes only initials
present in the dataset. Each letter is a direct activation target that moves focus to the first
record for that letter without changing the URL.

Touch scrubbing is progressive enhancement. Direct letter activation, keyboard navigation, and the
browser’s ordinary page scroll remain complete single-pointer alternatives. Scrubbing cannot capture
page scrolling until the pointer begins on the index, and reduced motion removes animated scrolling.

## Skills ledger

Skills render as a single contiguous white ledger rather than unrelated rounded records. Each row
contains the skill name, a four-part level rule, an editable `X / 60` count, and adjacent decrement
and increment controls.

Each progress segment represents fifteen levels. Filled portions use the Skills blue; later segments
remain pale, while completed earlier segments retain enough saturation to read as accumulated
progress. The count is the authoritative text representation and remains directly editable. The
visual rule is hidden from assistive technology so the row exposes one concise grouped label.

Completed skills use muted ink and the established completion-mark treatment without disappearing
unless the global completed-content preference hides them. The list remains dense enough to show
most skills in one phone viewport.

The Everything view reuses a compact version of the same record. It may omit direct numeric editing
when space is constrained, but retains decrement and increment controls and an accessible level
value.

## Mine survey

The Mines page retains two shared sections: “Floor progress” and “Spells”. Spells continue to use
the tracker-row paper stack without bespoke changes.

The expanded floor section becomes a compact horizontal survey strip:

- One full-width depth rule represents floors zero through the current maximum.
- The rule is divided at biome boundaries derived from tracker data rather than hardcoded visual
  percentages.
- Completed depth uses the Mines brown. Unreached depth uses a pale brown track.
- A small marker identifies the current floor.
- The current readout shows `Floor X / Y`, the biome name, and its floor range.
- Decrement and increment controls flank the readout, and the number remains directly editable.

Biome names are not repeated inside narrow segments where they would collide. The current biome is
always named in text beneath the rule, and wider layouts may add abbreviated segment labels when
space permits. The strip is a visual summary, not a slider; the adjacent controls and numeric input
remain the only editing mechanisms.

Everything uses the existing compact floor row, updated to share the same count typography and
progress color without rendering the full survey strip.

## Renown register

Renown becomes a rank register rather than a generic dashboard card.

The top record shows the current rank as a pressed category-colored seal, the rank name in
Instrument Serif, the within-rank level, the overall `X / Y` value, and decrement and increment
controls. A thin amber progress rule replaces the generic progress component. Direct numeric editing
remains available from the count.

The rank list is one contiguous white register. Each row contains the rank mark, name, level range,
and current-state value when relevant:

- completed ranks use a filled mark, muted ink, and the shared completion slash treatment;
- the current rank receives a restrained amber print mark behind its name and a partially filled
  rank mark; and
- upcoming ranks use outline marks and preserve existing spoiler behavior.

Rank-specific colors remain useful inside the small marks, but they do not create separate card
backgrounds. The amber category color owns selection, progress, and focus emphasis, preventing the
rank palette from fragmenting the page.

Everything reuses a compact current-rank record and does not repeat the complete rank register.

## State and motion

All numeric controls continue to mutate the existing `userState` methods, preserving clamping,
persistence, import, transfer, celebration, and relationship-normalization contracts. Phase 5 does
not introduce a second state model.

Progress fills, current-floor markers, and rank impressions may transition over the existing short
motion duration. Reduced-motion mode applies the resulting state immediately. Alphabetic navigation
uses immediate scrolling under reduced motion.

## Accessibility contract

Every changed surface must preserve or add:

- semantic buttons and grouped labels for numeric controls;
- an accessible text value for every visual meter;
- visible focus in both themes;
- at least 44 × 44 CSS-pixel targets on coarse or no-hover devices and at least 24 × 24 CSS-pixel
  targets in all layouts;
- logical reading and tab order at phone and desktop widths;
- 320 CSS-pixel reflow without two-dimensional page scrolling;
- non-color distinctions for completed, current, upcoming, known, and spoilered states;
- explicit reduced-motion behavior;
- contrast validation in light and dark themes; and
- stateful browser accessibility checks for Townsfolk relationship decisions, alphabetic navigation,
  direct numeric editing, and specialized progress states.

## Acceptance criteria

Phase 5 is complete when:

- all ordinary category sections use the shared field-guide divider without changing tracker-row
  behavior;
- Townsfolk matches the approved compact roster and progressive relationship model;
- NPC icons are sourced from the local game-asset pipeline, with a safe initial fallback;
- Skills, Mines, and Renown use the specialized records described above;
- Everything remains compact and behaviorally consistent;
- no category duplicates shared filtering, spoiler, completion, or state-mutation behavior; and
- focused component tests, the complete unit suite, type checking, linting, production build, and
  the browser accessibility suite pass cleanly.
