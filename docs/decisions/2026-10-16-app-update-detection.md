---
id: 2026-10-16-app-update-detection
status: amended
summary: >-
  Consent-based activation was replaced by updates at each page’s safe moment. Detection & retry
  reasoning retain their scope.
evidence:
  - docs/decisions/2026-10-20-automatic-app-updates.md
  - https://github.com/mrh-is/mistria-fyi/issues/111
relationships:
  - type: superseded-by
    target: 2026-10-20-automatic-app-updates
    scope: partial
    portion: >-
      Only waiting-worker consent, the Refresh prompt, & cross-tab activation/reload policy;
      detection is unchanged.
    evidence:
      - docs/decisions/2026-10-20-automatic-app-updates.md
      - https://github.com/mrh-is/mistria-fyi/issues/111
    revisit:
      condition:
        Reloading other tabs without a prompt becomes acceptable, with each page waiting for its own
        safe moment.
      evidence: https://github.com/mrh-is/mistria-fyi/issues/111
      authorization: https://github.com/mrh-is/mistria-fyi/issues/111
---

# App update detection

Superseded by [2026-10-20-automatic-app-updates.md](2026-10-20-automatic-app-updates.md): updates
now activate without consent and each page reloads at its own safe moment. Detection is unchanged.

## Context

A tracker tab behind a fullscreen game can remain visible to Chrome for days, with neither a
visibility event nor a full navigation. The visibility-only worker check leaves that tab on its
original build indefinitely.

## Decision

Use SvelteKit’s `updated` state for detection, polling every 10 minutes, and call
`registration.update()` once detection reports a new deploy. Leave the version metadata request to
the browser to avoid offline false positives from cached versions. Preserve the waiting-worker
consent flow recorded in the PWA verification guide; the toast appears after installation, and
accepting activates the worker & reloads controlled tabs. Pages without a controlling worker offer a
network reload instead.

An existing active registration doesn’t change the uncontrolled-page fallback: navigation requests
are network-first, so even an old worker fetches current HTML before consulting its cache.
Installing another worker without activating it would not change that reload behavior.

Failed or no-op installs retry on online, focus, & visible events, throttled to five minutes, with
an hourly fallback for unattended tabs. Stop retries once a worker waits. This bounds repeated
precache downloads when installation fails.

## Alternatives

Replacing worker activation with a reload loses the atomic offline-cache swap. Another detection
timer duplicates SvelteKit’s tiny metadata checks with worker-script fetches. The default hourly
poll leaves data releases stale too long. Automatic activation when idle or navigating would reload
other tabs without consent, reversing the existing decision, and remains outside this issue.

## Revisit if

SvelteKit starts activating workers itself, sync becomes build-bound, or Cloudflare Pages stops
serving these static polls without Worker charges. Reconsider navigation consent separately if
reloading every other tab becomes acceptable.
