---
id: 2026-11-01-visual-diff-pilot
status: current
summary:
  Compare two representative routes without gating CI, and isolate PR execution from privileged
  image publication.
evidence:
  - https://github.com/mrh-is/mistria-fyi/issues/332
  - .github/workflows/visual-diff.yml
  - .github/workflows/visual-diff-publish.yml
  - docs/visual-diff-pilot.md
relationships: []
---

# Nonblocking visual comparisons

## Context

The owner approved a small pilot in #332, part of the CI reliability work. Reviewers need directly
visible comparisons, while capture instability must remain observable without blocking the existing
CI check.

## Decision

Compare the home page & an expanded almanac category in the initial viewport at desktop/mobile
widths & both themes. Use exact base/head commits, one shared capture harness, & the existing
controlled browser assets. Capture each state twice so repeat noise remains measurable. Combine
comparisons into six sheets to respect the attachment cap.

Keep capture in an independent read-only PR workflow. Publish validated images with trusted
default-branch code in a separate workflow. This separates execution of PR code from the token that
can upload attachments & write comments. Preserve the existing accessibility & manual verification
gates.

The owner approved one exception to the repository’s `workflow_run` ban for
`visual-diff-publish.yml`. The hardening test checks that this workflow executes only the trusted
publisher script, checks out the default branch without saved credentials, & downloads artifacts
outside the checkout. Every other workflow remains subject to the original trigger ban.

## Alternatives

A blocking snapshot test would enforce an unproven comparison strategy. An artifact-only report
would fail the approved requirement for images directly on the PR. Publishing from the same
privileged job that builds PR code would expose write credentials. Full-page or broad route coverage
would increase cost & noise before the pilot has evidence.

## Revisit if

Repeated CI samples establish affordable cost, negligible repeat noise, & useful review findings.
Expand coverage or propose replacing repetitive manual screenshot work only with that evidence & the
owner’s approval. Revisit publication isolation if GitHub offers a narrower attachment-upload
permission.
