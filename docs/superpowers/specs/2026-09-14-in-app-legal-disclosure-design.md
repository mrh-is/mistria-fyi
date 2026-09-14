# In-app legal disclosure

Issue #218 and PR #236. This design makes the deployed tracker’s authorship, affiliation, accuracy,
and intellectual-property boundaries visible before the maintainer asks NPC Studio for permission to
publish the repository.

## Goals

- Give ordinary tracker users an accessible, durable explanation of what the project does and does
  not claim.
- Keep the deployed tracker, repository documentation, and NPC Studio outreach description
  consistent.
- State facts without asserting that the project’s use of game material is legally permitted.
- Preserve the tracker’s local-first privacy and offline behavior.

## Product surface

Add an `/about` route titled “About this guide”. Link it from the quick-settings panel and the data
management footer, beside the existing privacy and AI disclosures. Add it to the sitemap and the
browser accessibility route matrix.

The page must state that:

- Mistria Field Guide is an independent, unofficial, noncommercial fan project maintained by Michael
  Helmbrecht, without NPC Studio affiliation, endorsement, support, or sponsorship.
- The maintainer claims the project’s original code, interface, organization, and editorial work,
  but not Fields of Mistria or its names, marks, characters, artwork, sprites, or other game-derived
  material.
- Tracker data is generated for a specific game version, may be incomplete or outdated, and is not
  an official source or a substitute for the game.
- Original game input files are not distributed, while the deployed tracker currently contains
  selected extracted icons and a generated factual dataset.
- Rights holders can contact the maintainer privately at `me@mrh.is` to request review, correction,
  modification, or removal. Ordinary users should continue to use the in-app feedback flow.

The page must link to the official Fields of Mistria website and NPC Studio website. It must not
state that fair use, permission, or any other legal defense has been established.

## Repository boundary

Revise the repository documents so GPL-3.0-only applies only to project-authored material. Exclude
game-derived content wherever it occurs, including within generated data, rather than purporting to
license whole mixed files. Describe redistributed game material accurately and do not say that it
has a project-granted or third-party redistribution license.

## Non-goals

- This work does not grant or document NPC Studio permission.
- This work does not make the repository public.
- This work does not resolve the Satoshi font redistribution question.
- This work does not add terms of service or change the privacy model.
