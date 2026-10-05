import { SvelteURL } from "svelte/reactivity";

/**
 * Reactive stand-in for SvelteKit's `$app/state` `page` object, for client tests that need to
 * drive route changes. Components read `page.url` inside `$derived`, so the stub keeps its fields
 * in `$state` and a test calls `navigate()` to simulate a client-side navigation.
 *
 * Usage: `vi.mock("$app/state", async () => ({ page: (await import("#lib/test-utils/page-stub.svelte")).pageStub }))`.
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
