# Farm planner geometry

Amends [the public launch posture](2026-10-07-public-launch-posture.md).

## Context

The farm planner (public #4) pulls the farm’s layout from the game files. The launch posture covers
sprites & the factual dataset, & its “Revisit if” names maps among the material that would change
it: “the project starts distributing material beyond sprites & the factual dataset (audio, maps, or
original game files)”. A planner that ships the farm’s shape is close to a map, so the line needs
recording before any planner work starts.

## Decision

- **The planner uses derived geometry only.** What it ships is data computed from the game files for
  the planner’s own logic (what can be built where), not the game’s own art or layouts.
- **The line.** A coarse functional grid (cell types such as buildable, water, & blocked at a
  resolution coarser than the game’s tiles) is factual data, in the same class as the dataset. These
  are maps, & stay out:
  - full-resolution tile shapes;
  - game sprites placed in position;
  - a pack that, rendered back, reproduces a recognizable layout of the game’s farm.
- **The pack is lazy & independently removable.** The geometry lives in its own pack that loads only
  when the planner opens. It is not in `tracker-data.json`, the main bundle, or the service worker’s
  install-time precache, & removing it leaves the rest of the site working (the planner shows
  nothing it cannot draw, or is withdrawn with it).
  [The takedown procedure](../takedown.md#farm-planner-pack) has the steps.
- **A new asset class needs its own review.** If a planner feature needs more than the line allows,
  record that decision before building it; this record is not a general license for map data.

## Alternatives

- **Ship full-resolution tile data (a map):** rejected; it is the material the launch posture’s
  “Revisit if” says would change the posture, & the planner’s logic does not need it.
- **Render the game’s sprites or layout art in the planner:** rejected for the same reason; the
  sprites are already withdrawn through a single prefix, & a layout rendered in place is a map.
- **Fold the geometry into the dataset:** rejected, since the dataset cannot be removed without
  taking the site down, while the pack can be removed alone.
- **Defer the question until the planner is built:** rejected; the line is cheap to state now &
  expensive to retrofit after a pack exists.

## Revisit if

NPC Studio replies about maps or any derived geometry, a rights holder objects to the planner, the
planner needs geometry finer than the coarse grid, or the pack’s contents can be rendered back into
a recognizable layout (a check worth repeating when the pack’s format is designed).
