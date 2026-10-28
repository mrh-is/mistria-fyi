---
id: 2026-10-27-search-reveal
status: needs-review
summary: >-
  Both searches reveal every matching row automatically through the shared row-reveal controller,
  without requiring scrolling or another action. Home search retains its ranked cross-category list
  & category tags; category filters retain their section layout. Both keep the existing 200 ms input
  debounce.
review: >-
  Does this decision still apply unchanged? Its owning implementation & later resolutions were not
  revalidated while seeding issue #268.
evidence:
  - docs/decisions/2026-10-27-search-reveal.md#decision
relationships: []
---

# Search result reveal

## Context

Home search capped results at 50 while category filters revealed every matching row. Broad queries
spend substantial time rendering rows, including source cards inside closed disclosures.

## Decision

Both searches reveal every matching row automatically through the shared row-reveal controller,
without requiring scrolling or another action. Home search retains its ranked cross-category list &
category tags; category filters retain their section layout. Both keep the existing 200 ms input
debounce.

Home starts each replacement query or locale at the top of its scroll container so the new first
screenful stays visible; completion & undo preserve the scroll position. Home also defers offscreen
layout & paint through the browser while retaining every revealed result in the DOM.

Source papers mount their card content on first expansion & retain it afterward, preserving closing
animations & subsequent opens while avoiding the initial cost for unvisited disclosures. The
disclosure panel & its stable accessibility ID remain mounted throughout.

## Alternatives

A fixed result cap hides valid matches. Scroll-triggered rendering delays browser find-in-page until
the player visits each region. Rendering all rows synchronously blocks input. Giving both searches
the same layout obscures their different scopes.

Unmounting source cards on collapse would remove their content during the closing animation. Keeping
every card mounted makes broad queries construct content that players may never open.

## Revisit if

Revisit progressive rendering if a different row representation makes synchronous rendering fit the
interaction budget. Revisit deferred source cards if unopened disclosure content must be available
to a feature that cannot open the disclosure first.
