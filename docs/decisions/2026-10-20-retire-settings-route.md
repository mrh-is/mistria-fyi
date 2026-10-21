# Retire the settings route

## Context

PR #156 prerendered the obsolete beta route `/settings` as a blank placeholder that forwarded to
`/data` after hydration. Without JavaScript, the placeholder stayed blank. The launch contract
listed the route among promised slugs; its route-change condition now applies, and the maintainer
explicitly approved removal without a redirect in #156.

## Decision

Remove `/settings`, its prerender entries, & its redirect tests. Requests receive the normal
not-found page. `/data?section=import|transfer` remains the supported data-management entry point.

## Alternatives

- Retain the browser redirect: rejected because it preserves an unnecessary blank placeholder.
- Restore a server redirect: rejected because the maintainer approved retiring the beta route.

## Revisit if

Evidence of active external links requires a compatibility redirect.
