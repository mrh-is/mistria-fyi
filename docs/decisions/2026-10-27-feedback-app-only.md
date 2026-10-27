# App-only feedback authentication

## Context

PR #226 merged the GitHub App authentication path. The owner then requested removal of the temporary
personal access token fallback. The
[earlier decision record](2026-10-22-feedback-github-app.md#revisit-if) permits removal after the
App cutover; the owner’s request authorizes this follow-up.
[Issue #242](https://github.com/mrh-is/mistria-fyi/issues/242), filed by the feedback App on October
27, 2026, confirms that the App files issues in production. Personal token revocation remains
unverified.

## Decision

Production feedback requires all three GitHub App settings. Missing or blank settings return `503`,
with only the missing variable names logged. Remove the legacy token binding from the runtime
contract & environment example; retain the App token cache, rejection invalidation, & safe error
handling.

Preview builds retain the [dry-run behavior](2026-10-27-feedback-preview-dry-run.md) added on main:
they do not require App settings, file GitHub issues, or persist contact emails.

## Alternatives

Keeping the personal token fallback was rejected because the owner requested its removal after
merging the App authentication change. Keeping two authentication paths would preserve obsolete
configuration & maintenance work.

## Revisit if

Feedback moves away from GitHub App authentication, or its hosting environment can no longer sign
App JWTs or obtain installation tokens.
