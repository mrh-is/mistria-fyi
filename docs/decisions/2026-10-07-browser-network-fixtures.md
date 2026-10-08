# Browser network fixtures

## Context

Issue #692 requires browser suites to run without internet dependencies. Production builds contain
CDN sprite & font URLs, & the feedback panel loads Turnstile. PWA tests must retain real
service-worker registration, caching, & offline navigation.

## Decision

Accessibility & PWA specs import one shared Playwright fixture. Browser-context routes fulfill known
sprite requests from four synthetic WebP icons, using a manifest of production dimensions & missing
assets. The fixture serves a local Turnstile UI stub, aborts known remote fonts to exercise
system-font fallback, & fails unhandled external requests. An independent request observer detects
page-route overrides; service-worker network fetches remain guarded while cached responses remain
usable.

## Alternatives

A separate asset server or test-specific production build would add startup & artifact coordination
to every browser job. Context fulfillment works with the existing build artifact & preserves
production service-worker sprite URLs. Generic single-pixel images would change native dimensions;
committing every sprite or font would enlarge the source tree & conflict with the proprietary-font
boundary.

## Revisit if

Add real, licensed local assets if browser tests need to verify artwork or locale typography. Expand
the Turnstile stub deliberately if feedback tests cover challenge renewal; a real successful server
challenge belongs in a separately authorized live smoke test. Revisit the routing approach if the
suites add a browser whose worker network requests cannot be intercepted.
