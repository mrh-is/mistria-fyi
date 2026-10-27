# App-only feedback authentication

## Context

PR #226 merged the GitHub App authentication path. The owner then requested removal of the temporary
personal access token fallback. The
[earlier decision record](2026-10-22-feedback-github-app.md#revisit-if) permits removal after the
App cutover; the owner’s request authorizes this follow-up. Production credential deployment & token
revocation were not independently verified.

## Decision

The feedback endpoint requires all three GitHub App settings. Missing or blank settings return
`503`, with only the missing variable names logged. Remove the legacy token binding from the runtime
contract & environment example; retain the App token cache, rejection invalidation, & safe error
handling.

## Alternatives

Keeping the personal token fallback was rejected because the owner requested its removal after
merging the App authentication change. Keeping two authentication paths would preserve obsolete
configuration & maintenance work.

## Revisit if

Feedback moves away from GitHub App authentication, or its hosting environment can no longer sign
App JWTs or obtain installation tokens.
