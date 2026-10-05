import { localizeHref } from "#lib/paraglide/runtime.js";
import { resolve } from "$app/paths";

import type { LocaleCode } from "#lib/types/locale.js";
import type { Path, ResolvedPathname } from "$app/types";

/**
 * `resolve()`s a known route path (accounting for a deployed base path) and localizes it for the
 * current locale. The single place this composition happens — every internal `<a href>` calls
 * this instead of `resolve()` alone.
 *
 * The result is exactly as base-path-resolved as `resolve()`'s own return value — localizing on
 * top only adds a locale segment SvelteKit's own route types don't know about, since that segment
 * is stripped by the `reroute` hook before routing sees it. The `ResolvedPathname` return type
 * reflects that guarantee, which is what lets `eslint-plugin-svelte`'s `no-navigation-without-
 * resolve` rule recognize a call to this function as equivalent to a bare `resolve()` call, with
 * no per-call-site suppression needed.
 */
export function localizedHref(path: Path, options?: { locale: LocaleCode }): ResolvedPathname {
  return localizeHref(resolve(path), options) as ResolvedPathname;
}
