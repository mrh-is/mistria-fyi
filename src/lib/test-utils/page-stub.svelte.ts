import { SvelteURL } from "svelte/reactivity";

/**
 * Reactive stand-in for SvelteKit's `$app/state` `page` object, for tests that need a URL or status
 * other than the shared setup's, or that drive route changes. Components read `page.url` inside
 * `$derived`, so the stub keeps its fields in `$state` and a test calls `navigate()` to simulate a
 * client-side navigation.
 *
 * Usage: `vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));` (this module
 * exports `page`), then set `pageStub.status` or call `pageStub.navigate()`.
 */
const ORIGIN = "https://mistria.fyi";

export class PageStub {
  data = $state<Record<string, unknown>>({ locale: "en" });
  status = $state(200);
  url = new SvelteURL(`${ORIGIN}/en`);

  navigate(pathname: string): void {
    this.url.href = `${ORIGIN}${pathname}`;
  }

  reset(): void {
    this.data = { locale: "en" };
    this.status = 200;
    this.url.href = `${ORIGIN}/en`;
  }
}

export const pageStub = new PageStub();

/** `$app/state`'s export name, so this module can stand in for it whole. */
export const page = pageStub;
