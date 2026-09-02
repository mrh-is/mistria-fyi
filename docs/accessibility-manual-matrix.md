# Accessibility manual test matrix

Copy this file for each accessibility-focused release. Do not mark a row “Pass” unless a person
completed the described task with the recorded setup. Use “Unavailable” when the required platform
or technology could not be obtained, and “Not run” when it remains outstanding.

## Test record

| Field                | Value        |
| -------------------- | ------------ |
| Tester               | Not assigned |
| Date                 | Not run      |
| Revision or release  | Not set      |
| Overall result       | Not run      |
| Linked release issue | Not set      |

For every executed row, record the OS and device, browser and version, assistive technology and
version, route, task, viewport, zoom, text spacing, theme, motion preference, contrast mode,
orientation, result, observation, exception, and linked issue.

## Assistive technology

| Result  | Platform         | Browser           | Technology                   | Route and task                                                              | Observation, exception, or issue |
| ------- | ---------------- | ----------------- | ---------------------------- | --------------------------------------------------------------------------- | -------------------------------- |
| Not run | macOS            | Safari            | VoiceOver                    | Complete a tracker row, use Undo, search, and operate Settings dialogs      |                                  |
| Not run | iOS              | Safari            | VoiceOver                    | Import or transfer progress, navigate categories, and complete a row        |                                  |
| Not run | Windows          | Firefox           | NVDA                         | Navigate headings and landmarks, change NPC and mine values, and use search |                                  |
| Not run | Windows          | Chrome            | NVDA                         | Operate dialogs, validation, disclosures, tracker rows, and Undo            |                                  |
| Not run | Android          | Chrome            | TalkBack                     | Navigate categories, search, complete a row, and use transfer controls      |                                  |
| Not run | Desktop platform | Supported browser | Voice Control or equivalent  | Activate repeated tracker controls by their spoken names                    |                                  |
| Not run | Apple platform   | Supported browser | Switch Control or equivalent | Sequentially scan dense tracker rows, toolbar controls, and dialogs         |                                  |

## Input, reflow, and visual preferences

| Result  | Setup                                  | Route and task                                              | Required observation                                                      | Observation, exception, or issue |
| ------- | -------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| Not run | Keyboard only, desktop viewport        | All primary routes                                          | Logical focus order, visible focus, no traps, and restored focus          |                                  |
| Not run | Keyboard only, 320-pixel viewport      | Home, Almanac, NPCs, Mines, Settings                        | Every action remains reachable without horizontal page scrolling          |                                  |
| Not run | 200% text zoom                         | Home, All, NPCs, Settings                                   | Text reflows without clipping or lost controls                            |                                  |
| Not run | 400% page zoom or 320-pixel equivalent | All primary routes                                          | Single-column reflow and no two-dimensional page scrolling                |                                  |
| Not run | WCAG text spacing override             | Home, tracker rows, dialogs, Settings                       | No clipped, overlapped, or lost text                                      |                                  |
| Not run | Reduced motion                         | Completion, disclosure, feedback, and Settings navigation   | Status remains available and non-essential motion is removed              |                                  |
| Not run | Light theme                            | Home, NPCs, Mines, Settings                                 | Text, controls, focus, errors, and disabled states remain distinguishable |                                  |
| Not run | Dark theme                             | Home, NPCs, Mines, Settings                                 | Text, controls, focus, errors, and disabled states remain distinguishable |                                  |
| Not run | Windows High Contrast                  | Tracker rows, selected filters, errors, spoilers, and focus | Boundaries and semantic states remain perceivable                         |                                  |

## Installed PWA

| Result  | Platform       | Orientation | Route and task                                                    | Required observation                                  | Observation, exception, or issue |
| ------- | -------------- | ----------- | ----------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------- |
| Not run | iOS or Android | Portrait    | Install, launch, navigate, search, and track progress             | App launches and operates without an orientation lock |                                  |
| Not run | iOS or Android | Landscape   | Rotate while installed, navigate, open panels, and track progress | Content reflows and every control remains reachable   |                                  |

## Sign-off

- [ ] Every required combination is marked Pass, Fail, Unavailable, or Not run.
- [ ] Every failure and accepted exception links to a GitHub issue.
- [ ] Unavailable combinations include a reason and release decision.
- [ ] Automated CI evidence is linked, but is not treated as assistive-technology evidence.
- [ ] The release owner reviewed remaining Fail, Unavailable, and Not run entries.
