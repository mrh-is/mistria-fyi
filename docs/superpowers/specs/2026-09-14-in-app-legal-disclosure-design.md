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

Add an `/about` route titled “About”. Link it from the quick-settings panel beside the data
management link. Present those two quick-settings actions in a compact two-column row. Add the route
to the sitemap and the browser accessibility route matrix.

The About header back control must return through browser history, with home as its no-history
fallback. Move the privacy link and AI disclosure control from the data management footer to the
About footer, and make About the privacy page’s static back target. The data management footer
retains only the game and Field Guide version line.

The page must state that:

- Mistria Field Guide is an independent, unofficial, noncommercial fan project maintained by Michael
  Helmbrecht, without NPC Studio affiliation, endorsement, support, or sponsorship.
- Fields of Mistria and its game content remain the property of NPC Studio and the applicable rights
  holders.
- Tracker data identifies the game version from which it was generated and warns that the guide will
  be out of date after a game update.
- Visitors can contact the maintainer privately at `michael@mistria.fyi`. Ordinary users should
  continue to use the in-app feedback flow, identified by its toolbar icon.

The page must link to the official Fields of Mistria website and NPC Studio website. It must not
state that fair use, permission, or any other legal defense has been established.

## Repository boundary

Revise the repository documents so GPL-3.0-only applies only to project-authored material. Exclude
game-derived content wherever it occurs, including within generated data, rather than purporting to
license whole mixed files. Describe redistributed game material accurately and do not say that it
has a project-granted or third-party redistribution license.

## Proprietary font boundary

Do not include the proprietary Satoshi font file in the publishable repository tree. The application
must prefer a locally installed copy and otherwise load the production web font from the
project-controlled `assets.mistria.fyi` Cloudflare R2 domain. Keep a system-font fallback so a fresh
clone remains usable when the hosted asset is unavailable.

Ignore the expected local font file, document how contributors obtain Satoshi directly from
Fontshare, and identify the production object path and required R2 CORS configuration. Repository
notices must distinguish self-hosted use from redistribution through the source repository and must
warn that deleting the current-tree file does not remove its blob from existing Git history.

## Non-goals

- This work does not grant or document NPC Studio permission.
- This work does not make the repository public.
- This work does not create the Cloudflare R2 bucket, custom domain, DNS records, or object upload.
- This work does not remove Satoshi or game-derived assets from existing Git history.
- This work does not add terms of service or change the privacy model.
