---
id: 2026-10-31-source-based-feedback-redaction
status: current
summary: >-
  Feedback privacy follows each field's source. Keep game-owned IDs readable, redact known private
  values with an explicit marker where the diagnostic structure is useful, & exclude raw private
  containers. Do not guess personal information from an ID's spelling or numeric shape.
evidence:
  - https://github.com/mrh-is/mistria-fyi/pull/339
  - docs/sync.md#diagnostics
  - src/lib/sync/diagnostic-redaction.ts
  - src/lib/feedback/progress-attachment.ts
relationships: []
---

# Feedback redaction follows the data source

## Context

Feedback becomes a public GitHub issue. The owner wants a high bar for excluding personal
information while retaining useful diagnostics. The UI cannot edit the generated log or progress
attachment. Most values are game-owned IDs, enums, & counts; a small set of known sources holds
player-entered text, local paths, credentials, or identifying save metadata.

The adversarial review of PR #339 placed names, farm numbers, & personal-looking strings inside
unknown-ID slots. Those probes exposed weaknesses in defensive redaction. They did not establish
that the unmodified game puts personal information in those slots. The owner approved reviewing the
actual source of each field, preserving game IDs, & using explicit redaction where it keeps
diagnostic context.

## Decision

Project public diagnostics from explicitly selected sources. An ID this build does not recognize
still comes from a game-ID source; that alone is no reason to suppress or hash it. The public schema
limits structure & size. It is not a general personal-information detector.

The collector enforces an explicit list of public diagnostic paths, including the animal unlock
lists’ per-animal paths. IDs from unclassified paths become `[redacted]`. The extractor’s typed
diagnostics require each new ID source to be classified before it compiles.

The progress projection selects supported keys explicitly, with a compile-time completeness check
against `ProgressState`. Provenance entries keep only `source`, `obtainedSource`, & redacted
`playtime`; resolutions keep only `saveValue`. A newer build’s unknown fields remain private.

| Source                                                                                 | Public treatment                                                                                                            |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Build identifier, numeric `info.version`, protocol version                             | Keep the selected version values. Do not copy the whole metadata object.                                                    |
| App lane, outcome, field, policy, & counts                                             | Keep the app's enums & aggregate counts. Exclude fact values & question IDs.                                                |
| Game unlock lists, museum item IDs, animal type/variant keys, & quest IDs              | Keep unknown IDs within the log's shape & size limits. Known-private matches become `[redacted]`.                           |
| Character & farm names from `player` & `header`, plus the outgoing farm's names        | Use only as private comparison inputs. Never add name fields to the log.                                                    |
| Child, pet, & other player-entered names elsewhere in the save                         | Exclude their source objects; their text is not an unknown-ID source.                                                       |
| Incoming & outgoing farm numbers, follow keys, write tokens, & mailbox IDs             | Redact matches inside IDs. Exclude raw identifiers & credentials as fields.                                                 |
| Incoming farm number used to correlate events                                          | Keep only its SHA-256 hash with a random, unexported tab-session salt.                                                      |
| Filename, device path, file hash, timestamps, raw saves, & raw diagnostic paths/values | Exclude these containers & values from the log.                                                                             |
| Progress `lastSavePlaytime` & each provenance entry's `playtime`                       | Preserve detailed fields with `[redacted]`. Oversized provenance becomes counts by field & source, without playtime values. |
| Other supported progress fields, including retained unknown game IDs                   | Select only explicitly classified progress keys. Exclude unknown keys, local state, save identity, & farm-switch backups.   |

Use `[redacted]` when it explains that a diagnostic slot had a value deliberately withheld. Omit raw
private containers altogether; do not add otherwise-unused private fields merely to show a marker.
Exact playtime values remain excluded from feedback, as the owner previously decided; the marker
preserves their presence without publishing the values. This changes only feedback, not backups,
stored progress, or sync's use of playtime.

Large progress attachments use the
[bounded summary projection](2026-10-31-bounded-feedback-progress.md). The preview, submission, &
API share its 32 KiB budget. Summaries are explicit, retain only selected counts, & never introduce
a new private source.

Redaction can enlarge short values. Enforce the attachment byte limit after projecting progress from
older clients, & enforce the event byte limit after every buffered-ID recheck as well as after
adding an event. A redaction update must never leave an oversized intermediate preview.

Name matching ignores case, accents, separators, & common Latin romanizations. Character-name words
also count; farm-name words count only together because words such as “rose” & “farm” are ordinary
game vocabulary. Names under three characters match whole words, including acronym, capital, & digit
boundaries, to avoid hiding unrelated IDs such as `almanac` for “Al”. These are defensive rules for
known private inputs, not a promise to recognize every conceivable encoding.

The collector remembers private comparison patterns for the tab session & rechecks buffered IDs
whenever it learns more. It also rechecks events after asynchronous hashing, before retaining them.
The comparison text has a separate 16 KiB budget, is never exported or persisted, & clears on
reload. If that budget fills, all ID text is redacted for the rest of the session rather than
forgetting private values. The public event log keeps its existing 20-event & 24 KiB limits.

The farm hash intentionally correlates events & submissions from the same tab session. It does not
reveal the raw farm number. The log is not a claim that all gameplay patterns are impossible to
correlate, nor that arbitrary edited HTTP requests or hand-edited saves have been anonymized.

## Verification

Trace every exported field to its producer. Test that private source objects & raw diagnostic values
never enter the projection, & that supported paths pass all known private comparison inputs.
Exercise late-discovered names, changing private context, & asynchronous collection. Check that
previews & submitted data agree, the server excludes private values from older clients, & redacted
attachments cannot mutate the original backup.

Synthetic IDs containing known private values are useful hardening tests. Keep them distinct from
evidence about what the game actually writes. Preserve otherwise-valid game IDs without adding date,
phone, address, or long-digit guesses.

## Alternatives

- Suppressing or hashing every unknown ID loses the information needed to diagnose new game IDs.
- Generic personal-information patterns misclassify game vocabulary & numbers without proving that
  the remaining text is anonymous.
- Deleting every sensitive slot hides whether the input existed; a marker preserves that context.
- Relying on the UI or schema alone misses source changes & known-private matches inside IDs.

## Revisit if

A game update, supported mod, extractor, or feedback feature introduces a path from player-entered
text into an exported field. Audit that source & add explicit redaction before exporting it. Also
revisit if logs become editable, persist across reloads, or are collected without the current opt-in
preview.
