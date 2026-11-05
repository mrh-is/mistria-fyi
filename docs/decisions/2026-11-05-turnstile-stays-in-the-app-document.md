# Turnstile stays in the app document

## Context

The November project review (#441, finding SEC-3) pointed out that the Turnstile script runs in the
app’s own document, beside the sync keys & write tokens in browser storage. A compromised script
delivery could read them. The source shows no leak, and #458 asked for a recorded decision on
whether the challenge should move to a separate origin that can’t reach tracker storage.

## Decision

The challenge stays in the app document. The privacy page now says that encryption protects what the
server stores, and that players still trust the code they’re served, including this script.

Cloudflare already serves the whole app, so isolating its script removes no trusted party. It would
shrink the attack surface, though: a bad Turnstile release needn’t reach this project’s deployment,
and in the app document it could read those secrets. We accept that risk. The script loads only on
demand, when a player makes a sync code or opens the feedback form, and it then stays until the page
reloads. The Content Security Policy limits scripts to the app & `challenges.cloudflare.com`.

## Alternatives

- **Run the challenge in a frame on a separate origin, passing back only the token:** rejected. It
  adds a deployed origin, a validated `postMessage` channel, & a CSP change, and it moves the
  hostname that the relay verifies (`TURNSTILE_HOSTNAME`). Sync setup & feedback would both take on
  a new way to fail, for a narrower attack surface but no change in who players must trust.

## Revisit if

The app moves off Cloudflare hosting, so that Turnstile’s origin becomes a party players don’t
otherwise trust. Also revisit if the app starts loading any other third-party script beside sync
secrets, or if the sync secrets move somewhere a same-document script can’t reach today.
