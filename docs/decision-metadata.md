# Decision metadata

The [decision index](decision-index.md) is generated from YAML headers in every Markdown record
under `docs/decisions/`. The header owns applicability metadata; the title & historical reasoning
remain in the record. `pnpm run decisions -- --json` returns the same records with their repository
paths, and `--status=needs-review` selects unresolved applicability.

## Header fields

Use this shape above the existing title:

```yaml
---
id: yyyy-mm-dd-short-name
status: needs-review
summary: Explain the currently established applicability.
review: Which portion still needs evidence from its owning source?
evidence:
  - https://github.com/owner/repository/issues/123
relationships: []
---
```

IDs are stable, unique, lowercase identifiers; retain the ID when moving a record. Paths & titles
are derived from the files. Evidence entries are existing repository-relative paths (optionally with
a fragment), or full GitHub issue, PR, commit, or source URLs. The validator checks local file
existence and remote URL shape; it does not verify fragments, remote reachability, authorization
claims, or the truth of an applicability assertion.

## Status meanings

| Status         | Meaning                                                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `current`      | Evidence supports the decision’s continuing applicability. This does not mean every historical implementation detail is still literal.                                |
| `amended`      | A named portion was amended or superseded; the rest of the reasoning remains applicable within its original scope. Each relationship identifies its affected portion. |
| `superseded`   | A replacement supersedes the entire decision. At least one full-scope “superseded-by” relationship is required.                                                       |
| `retired`      | The owner deliberately ended the decision without a replacement. Cite the retirement evidence. A decision to retire a feature can itself remain current.              |
| `needs-review` | Current applicability is unestablished. An explicit unresolved question is required; age alone establishes neither currency nor supersession.                         |

An “amended” record may also carry a “review” question for unresolved portions. The initial index
deliberately leaves decisions outside the demonstrated reconciliation & directly checked guidance as
“needs-review”; it is an inventory of applicability evidence, not a complete runtime audit.

## Relationship fields

Only the earlier record stores the relationship, pointing forward to a stable decision ID. Do not
duplicate inverse metadata in the replacement. Existing historical prose may still describe both
directions.

```yaml
relationships:
  - type: superseded-by
    target: yyyy-mm-dd-replacement
    scope: partial
    portion: The consent prompt only; detection remains applicable.
    evidence:
      - https://github.com/owner/repository/pull/123
    revisit:
      condition: Describe the earlier condition that was satisfied.
      evidence: https://github.com/owner/repository/issues/123
      authorization: https://github.com/owner/repository/issues/123
```

Types are “amended-by” & “superseded-by”; scopes are “partial” & “all”. “Amended” status requires
partial relationships. A satisfied revisit condition is evidence for reconsideration, not authority
to reverse policy. When claiming that a condition was satisfied, supply its evidence & the separate
owner authorization in “revisit”, and point the relationship to the resulting decision. The
[automatic-update record](decisions/2026-10-20-automatic-app-updates.md) illustrates that
distinction. Do not infer unverified conditions, such as personal token revocation.

## Maintenance commands

Run `pnpm run decisions -- --write` after adding or editing headers. `pnpm run decisions` validates
the directory & generated page without writing; `pnpm run lint` includes this check, and
changed-file lint includes it for decision metadata, the generated page, or validator changes. Fix
mode does not silently regenerate the index. Run
`pnpm exec vitest run scripts/decision-index.test.ts scripts/lint-files.test.ts` for validator
changes.

The initial reference scan found dozens of bare issue/PR numbers in records dated before the October
12 public cutover. Those references now name `mrh-is/mistria-fyi-private` explicitly; externally
scoped references retain their actual repository. This was a provenance repair, not a change to the
historical decisions. No general issue-number lint rule is introduced.
