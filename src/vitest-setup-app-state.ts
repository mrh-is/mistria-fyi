import { afterAll, vi } from "vitest";

import { pageStub } from "#lib/test-utils/page-stub.svelte.js";

// Components read the active locale from `page.data.locale` (`$app/state`), which SvelteKit scopes
// per request on the server and per app in the browser. Outside a SvelteKit request, `page` throws,
// so tests that mount components directly get the reactive `pageStub` (English, status 200, `/en`).
// Shared client teardown resets this stub after each test. This file's hook resets it between
// files in the shared Node app project, too.
vi.mock("$app/state", () => import("#lib/test-utils/page-stub.svelte.js"));

afterAll(() => {
  pageStub.reset();
});
