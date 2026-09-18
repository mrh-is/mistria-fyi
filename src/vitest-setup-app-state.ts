import { vi } from "vitest";

// Components read the active locale from `page.data.locale` (`$app/state`), which SvelteKit scopes
// per request on the server and per app in the browser. Outside a SvelteKit request, `page` throws,
// so tests that mount components directly get this stand-in. A test file that needs a different
// `page` shape (a URL, a status) mocks `$app/state` itself and shadows this one.
vi.mock("$app/state", () => ({
  page: {
    data: { locale: "en" },
    status: 200,
    url: new URL("https://mistria.fyi/en"),
  },
}));
