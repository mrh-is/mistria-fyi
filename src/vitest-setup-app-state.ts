import { afterAll, vi } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

// Components read the active locale from `page.data.locale` (`$app/state`), which SvelteKit scopes
// per request on the server and per app in the browser. Outside a SvelteKit request, `page` throws,
// so tests that mount components directly get the reactive `pageStub` (English, status 200, `/en`).
// A test that needs another URL or status sets `pageStub` & resets it in `beforeEach`. Files in a
// shared-registry project also share the stub, so it's reset after each file.
vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));

afterAll(() => {
  pageStub.reset();
});
