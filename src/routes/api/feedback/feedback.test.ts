import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { installationTokens } from "#lib/server/github-app-auth.js";
import { generateTestRsaKey } from "#lib/test-utils/rsa-test-key.js";

import { OPTIONS as handleOptions, POST as handlePost } from "./+server.js";

import type { env } from "cloudflare:workers";

type WorkerEnv = typeof env;

/**
 * The adapter's `cloudflare:workers` stand-in reads bindings from this global platform proxy, which
 * the adapter installs in dev. Each call swaps in its own bindings.
 */
const cloudflarePlatform = vi.hoisted(() => {
  const platform: { env: unknown } = { env: {} };
  Object.assign(globalThis, { __sveltekit_cloudflare_platform: platform });
  return platform;
});

function makeRequest(
  body: unknown,
  { origin = "https://mistria.fyi" }: { origin?: string } = {},
): Request {
  return new Request("https://mistria.fyi/api/feedback", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
    },
    method: "POST",
  });
}

function makeUrl(): URL {
  return new URL("https://mistria.fyi/api/feedback");
}

const validPayload = {
  appVersion: "0.15.1 (abc1234)",
  gameDataVersion: "0.5.0",
  message: "The tomato soup recipe seems wrong",
  turnstileToken: "test-turnstile-token",
};

async function callPost(
  request: Request,
  {
    fetchMock,
    platform,
  }: { fetchMock?: ReturnType<typeof vi.fn>; platform?: { env: WorkerEnv } } = {},
): Promise<Response> {
  const originalFetch = globalThis.fetch;
  if (fetchMock) {
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
  }

  cloudflarePlatform.env = (platform ?? mockPlatform()).env;

  try {
    const url = makeUrl();
    return await handlePost({
      request,
      url,
    } as Parameters<typeof handlePost>[0]);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const turnstileSuccessResponse = () => Response.json({ success: true }, { status: 200 });

const turnstileFailureResponse = () => Response.json({ success: false }, { status: 200 });

const INSTALLATION_TOKEN = "ghs_test_installation_token";

const installationTokenResponse = () =>
  Response.json(
    { expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), token: INSTALLATION_TOKEN },
    { status: 201 },
  );

let testPrivateKeyPem: string;

beforeAll(async () => {
  ({ privateKeyPem: testPrivateKeyPem } = await generateTestRsaKey());
});

beforeEach(() => {
  // The installation token cache is isolate-wide, so one test's token must not leak into the next.
  installationTokens.clear();
});

function appPlatform(overrides: Partial<WorkerEnv> = {}): { env: WorkerEnv } {
  const { env: base } = mockPlatform();
  return {
    env: {
      ...base,
      GITHUB_APP_ID: "123456",
      GITHUB_APP_INSTALLATION_ID: "7890",
      GITHUB_APP_PRIVATE_KEY: testPrivateKeyPem,
      ...overrides,
    },
  };
}

/** Every argument passed to the spied console methods, flattened for secret scanning. */
function consoleOutput(...spies: { mock: { calls: unknown[][] } }[]): string {
  return spies
    .flatMap((spy) => spy.mock.calls)
    .map((args) =>
      args
        .map((arg) =>
          arg instanceof Error
            ? `${arg.name}: ${arg.message} ${arg.stack ?? ""}`
            : JSON.stringify(arg),
        )
        .join(" "),
    )
    .join("\n");
}

function expectNoSecrets(output: string): void {
  const keyBody = testPrivateKeyPem.split("\n")[1];
  expect(output).not.toContain(keyBody);
  expect(output).not.toContain("-----BEGIN");
  expect(output).not.toContain(INSTALLATION_TOKEN);
  expect(output).not.toContain("ghp_test_token");
  expect(output).not.toContain("test-turnstile-secret");
  // A JWT is three base64url segments, & an App JWT's header always starts with `eyJ`.
  expect(output).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
}

function countCalls(
  fetchMock: ReturnType<typeof vi.fn>,
  matches: (url: string) => boolean,
): number {
  return fetchMock.mock.calls.filter((args: unknown[]) => matches(String(args[0]))).length;
}

const isExchange = (url: string) => url.endsWith("/access_tokens");
const isIssue = (url: string) => url.endsWith("/issues");

const githubSuccessResponse = () =>
  Response.json(
    {
      html_url: "PR 99 (private beta)",
      number: 99,
    },
    { status: 201 },
  );

function getGitHubCall(fetchMock: ReturnType<typeof vi.fn>): [url: string, options: RequestInit] {
  const call = fetchMock.mock.calls.find(
    (args: unknown[]) => typeof args[0] === "string" && args[0].endsWith("/issues"),
  );
  if (!call) {
    throw new Error("No GitHub API call found");
  }
  return call as [string, RequestInit];
}

function mockGitHubFailure(status: number) {
  return routingFetchMock({
    github: Response.json({ message: "error" }, { status }),
  });
}

function mockGitHubSuccess() {
  return routingFetchMock();
}

function mockPlatform(overrides?: {
  kvPutFail?: boolean;
  tokenMissing?: boolean;
  turnstileSecretMissing?: boolean;
}): { env: WorkerEnv } {
  return {
    env: {
      FEEDBACK_EMAIL_STORE: {
        put: overrides?.kvPutFail
          ? vi.fn().mockRejectedValue(new Error("KV write failed"))
          : vi.fn().mockResolvedValue(undefined),
      } as unknown as { env: WorkerEnv }["env"]["FEEDBACK_EMAIL_STORE"],
      GITHUB_FEEDBACK_TOKEN: overrides?.tokenMissing ? "" : "ghp_test_token",
      TURNSTILE_SECRET_KEY: overrides?.turnstileSecretMissing ? "" : "test-turnstile-secret",
    },
  };
}

function routingFetchMock(
  overrides: { github?: Response; installationToken?: Response; turnstile?: Response } = {},
): ReturnType<typeof vi.fn> {
  return vi.fn((url: string) => {
    if (typeof url === "string" && url.includes("turnstile")) {
      return Promise.resolve(overrides.turnstile ?? turnstileSuccessResponse());
    }
    if (typeof url === "string" && url.endsWith("/access_tokens")) {
      return Promise.resolve(overrides.installationToken ?? installationTokenResponse());
    }
    return Promise.resolve(overrides.github ?? githubSuccessResponse());
  });
}

describe("POST /api/feedback", () => {
  it("creates an issue and returns the URL on valid submission", async () => {
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest(validPayload);
    const response = await callPost(request, { fetchMock, platform: mockPlatform() });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { issueUrl: string };
    expect(data).toEqual({ issueUrl: "PR 99 (private beta)" });

    const [url, options] = getGitHubCall(fetchMock);
    expect(url).toContain("/repos/mrh-is/mistria-fyi/issues");
    const body = JSON.parse(options.body as string) as {
      body: string;
      labels: string[];
      title: string;
    };
    expect(body.title).toBe("[Feedback] The tomato soup recipe seems wrong");
    expect(body.labels).toEqual(["user feedback"]);
    expect(new Headers(options.headers).get("User-Agent")).toBe("Mistria-Field-Guide-Feedback");
  });

  it("includes email note in issue body when email provided", async () => {
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest({ ...validPayload, email: "user@example.com" });
    const kvPut = vi.fn().mockResolvedValue(undefined);
    const platform = mockPlatform();
    (platform.env.FEEDBACK_EMAIL_STORE as unknown as { put: typeof kvPut }).put = kvPut;
    await callPost(request, { fetchMock, platform });

    const [, options] = getGitHubCall(fetchMock);
    const body = JSON.parse(options.body as string) as { body: string };
    expect(body.body).toContain("\u{1F4E7} Contact email provided");
    expect(body.body).not.toContain("user@example.com");
    expect(kvPut).toHaveBeenCalledWith("99", expect.stringContaining("user@example.com"));
  });

  it("escapes @-mentions in user-written text so feedback can't notify GitHub users", async () => {
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest({
      ...validPayload,
      message: "cc @octocat and @mrh-is/maintainers",
      selectedElement: {
        category: "recipe",
        displayName: "@octocat",
        page: "/recipes",
      },
    });
    await callPost(request, { fetchMock, platform: mockPlatform() });

    const [, options] = getGitHubCall(fetchMock);
    const issue = JSON.parse(options.body as string) as { body: string };
    expect(issue.body).toContain(String.raw`cc \@octocat and \@mrh-is/maintainers`);
    expect(issue.body).toContain(String.raw`- **Name:** \@octocat`);
    expect(issue.body).not.toMatch(/(?<!\\)@/);
  });

  it("formats selected element metadata in the issue title and body", async () => {
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest({
      ...validPayload,
      selectedElement: {
        category: "recipe",
        displayName: "Tomato Soup",
        entityId: "tomato_soup",
        extra: { cookbook: "Mistrian Kitchen", level: 2 },
        page: "/recipes",
      },
    });
    await callPost(request, { fetchMock, platform: mockPlatform() });

    const [, options] = getGitHubCall(fetchMock);
    const issue = JSON.parse(options.body as string) as { body: string; title: string };
    expect(issue.title).toBe("[Feedback] recipe: Tomato Soup");
    expect(issue.body).toContain("**Selected element**");
    expect(issue.body).toContain(String.raw`- **ID:** tomato\_soup`);
    expect(issue.body).toContain("- **Page:** /recipes");
    expect(issue.body).toContain("- **level:** 2");
    expect(issue.body).toContain("- **cookbook:** Mistrian Kitchen");
  });

  it.each([
    ["missing category", { displayName: "Tomato Soup", page: "/recipes" }],
    ["unknown category", { category: "Recipes", displayName: "Tomato Soup", page: "/recipes" }],
    ["empty display name", { category: "recipe", displayName: " ", page: "/recipes" }],
    ["long page", { category: "recipe", displayName: "Tomato Soup", page: `/${"x".repeat(200)}` }],
    [
      "long entity ID",
      {
        category: "recipe",
        displayName: "Tomato Soup",
        entityId: "x".repeat(101),
        page: "/recipes",
      },
    ],
    [
      "too many extra keys",
      {
        category: "recipe",
        displayName: "Tomato Soup",
        extra: Object.fromEntries(Array.from({ length: 11 }, (_, index) => [`key${index}`, index])),
        page: "/recipes",
      },
    ],
    [
      "nested extra value",
      {
        category: "recipe",
        displayName: "Tomato Soup",
        extra: { nested: { value: true } },
        page: "/recipes",
      },
    ],
    [
      "unknown field",
      {
        category: "recipe",
        displayName: "Tomato Soup",
        page: "/recipes",
        privateData: "nope",
      },
    ],
  ])("returns 400 for selected element with %s", async (_name, selectedElement) => {
    const request = makeRequest({ ...validPayload, selectedElement });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("includes a details block when saveData is provided", async () => {
    const fetchMock = mockGitHubSuccess();
    const saveData = { almanac: ["item_a", "item_b"], renown: 3 };
    const request = makeRequest({ ...validPayload, saveData });
    await callPost(request, { fetchMock, platform: mockPlatform() });

    const [, options] = getGitHubCall(fetchMock);
    const issue = JSON.parse(options.body as string) as { body: string };
    expect(issue.body).toContain("<details>");
    expect(issue.body).toContain("Save data (user-provided progress snapshot)");
    expect(issue.body).toContain('"almanac"');
    expect(issue.body).toContain('"item_a"');
  });

  it("omits the details block when saveData is absent", async () => {
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest(validPayload);
    await callPost(request, { fetchMock, platform: mockPlatform() });

    const [, options] = getGitHubCall(fetchMock);
    const issue = JSON.parse(options.body as string) as { body: string };
    expect(issue.body).not.toContain("<details>");
  });

  it("returns 400 for non-object saveData", async () => {
    const request = makeRequest({ ...validPayload, saveData: "not an object" });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for array saveData", async () => {
    const request = makeRequest({ ...validPayload, saveData: [1, 2, 3] });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for saveData exceeding 50 KB", async () => {
    const saveData = { big: "x".repeat(51 * 1024) };
    const request = makeRequest({ ...validPayload, saveData });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for missing message", async () => {
    const request = makeRequest({ appVersion: "1.0", gameDataVersion: "1.0" });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for empty message", async () => {
    const request = makeRequest({ ...validPayload, message: "   " });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for message exceeding max length", async () => {
    const request = makeRequest({ ...validPayload, message: "x".repeat(5001) });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for missing appVersion", async () => {
    const request = makeRequest({ gameDataVersion: "1.0", message: "hi" });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for missing gameDataVersion", async () => {
    const request = makeRequest({ appVersion: "1.0", message: "hi" });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 for invalid email format", async () => {
    const request = makeRequest({ ...validPayload, email: "not-an-email" });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a payload larger than 100 KB before calling GitHub", async () => {
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest({ ...validPayload, ignored: "x".repeat(100 * 1024) });

    await expect(callPost(request, { fetchMock })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 when GitHub API returns 401", async () => {
    const request = makeRequest(validPayload);
    await expect(
      callPost(request, { fetchMock: mockGitHubFailure(401), platform: mockPlatform() }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("returns 503 when GitHub API returns 403", async () => {
    const request = makeRequest(validPayload);
    await expect(
      callPost(request, { fetchMock: mockGitHubFailure(403), platform: mockPlatform() }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("logs sanitized GitHub failure diagnostics", async () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue(undefined);
    const fetchMock = routingFetchMock({
      github: Response.json(
        {
          message: "Resource not accessible by personal access token\nwith extra detail",
        },
        {
          headers: {
            "X-Accepted-GitHub-Permissions": "issues=write",
            "X-GitHub-Request-Id": "request-123",
          },
          status: 403,
        },
      ),
    });
    const request = makeRequest(validPayload);

    await expect(callPost(request, { fetchMock, platform: mockPlatform() })).rejects.toMatchObject({
      status: 503,
    });
    expect(consoleError).toHaveBeenCalledWith("GitHub API error", {
      acceptedPermissions: "issues=write",
      message: "Resource not accessible by personal access token with extra detail",
      requestId: "request-123",
      status: 403,
    });
  });

  it("returns 503 when the GitHub request fails", async () => {
    const request = makeRequest(validPayload);
    const fetchMock = vi.fn((url: string) => {
      if (typeof url === "string" && url.includes("turnstile")) {
        return Promise.resolve(turnstileSuccessResponse());
      }
      return Promise.reject(new TypeError("fetch failed"));
    });

    await expect(callPost(request, { fetchMock, platform: mockPlatform() })).rejects.toMatchObject({
      status: 503,
    });
  });

  it("reports emailSaved: true when KV write succeeds", async () => {
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest({ ...validPayload, email: "user@example.com" });
    const response = await callPost(request, { fetchMock, platform: mockPlatform() });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { emailSaved?: boolean; issueUrl: string };
    expect(data.emailSaved).toBe(true);
    expect(data.issueUrl).toBe("PR 99 (private beta)");
  });

  it("reports emailSaved: false when KV write fails", async () => {
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest({ ...validPayload, email: "user@example.com" });
    const platform = mockPlatform({ kvPutFail: true });
    vi.spyOn(console, "error").mockReturnValue(undefined);
    const response = await callPost(request, { fetchMock, platform });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { emailSaved?: boolean; issueUrl: string };
    expect(data.emailSaved).toBe(false);
  });

  it("reports emailSaved: false when KV binding is missing", async () => {
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest({ ...validPayload, email: "user@example.com" });
    vi.spyOn(console, "error").mockReturnValue(undefined);
    const platform = {
      env: {
        GITHUB_FEEDBACK_TOKEN: "ghp_test_token",
        TURNSTILE_SECRET_KEY: "test-turnstile-secret",
      },
    } as unknown as { env: WorkerEnv };

    const response = await callPost(request, { fetchMock, platform });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { emailSaved?: boolean; issueUrl: string };
    expect(data.emailSaved).toBe(false);
  });

  it("omits emailSaved when no email is provided", async () => {
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest(validPayload);
    const response = await callPost(request, { fetchMock, platform: mockPlatform() });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { emailSaved?: boolean; issueUrl: string };
    expect(data.emailSaved).toBeUndefined();
  });

  it("truncates long messages in the issue title", async () => {
    const longMessage =
      "This is a very long feedback message that definitely exceeds eighty characters and should be truncated at a word boundary";
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest({ ...validPayload, message: longMessage });
    await callPost(request, { fetchMock, platform: mockPlatform() });

    const [, options] = getGitHubCall(fetchMock);
    const body = JSON.parse(options.body as string) as { title: string };
    expect(body.title.length).toBeLessThanOrEqual(100);
    expect(body.title).toMatch(/…$/);
    expect(body.title).toMatch(/^\[Feedback\] /);
  });

  it("returns 400 when turnstileToken is missing", async () => {
    const { turnstileToken: _, ...payloadWithoutToken } = validPayload;
    const request = makeRequest(payloadWithoutToken);
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 403 when Turnstile verification fails", async () => {
    const fetchMock = routingFetchMock({ turnstile: turnstileFailureResponse() });
    const request = makeRequest(validPayload);
    await expect(callPost(request, { fetchMock, platform: mockPlatform() })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("returns 503 when Turnstile verification request fails", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (typeof url === "string" && url.includes("turnstile")) {
        return Promise.reject(new TypeError("fetch failed"));
      }
      return Promise.resolve(githubSuccessResponse());
    });
    const request = makeRequest(validPayload);
    await expect(callPost(request, { fetchMock, platform: mockPlatform() })).rejects.toMatchObject({
      status: 503,
    });
  });

  it("sends the turnstile token and secret to the verification endpoint", async () => {
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest(validPayload);
    await callPost(request, { fetchMock, platform: mockPlatform() });

    const turnstileCall = fetchMock.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && args[0].includes("turnstile"),
    );
    expect(turnstileCall).toBeDefined();
    const [, turnstileOptions] = turnstileCall as [string, RequestInit];
    const body = JSON.parse(turnstileOptions.body as string) as {
      response: string;
      secret: string;
    };
    expect(body.response).toBe("test-turnstile-token");
    expect(body.secret).toBe("test-turnstile-secret");
  });

  it("returns 400 when turnstileToken is empty", async () => {
    const request = makeRequest({ ...validPayload, turnstileToken: "" });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 400 when turnstileToken is not a string", async () => {
    const request = makeRequest({ ...validPayload, turnstileToken: 12_345 });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });

  it("returns 503 when siteverify returns non-2xx", async () => {
    const fetchMock = routingFetchMock({
      turnstile: new Response("Internal Server Error", { status: 500 }),
    });
    const request = makeRequest(validPayload);
    await expect(callPost(request, { fetchMock, platform: mockPlatform() })).rejects.toMatchObject({
      status: 503,
    });
  });

  it("does not call GitHub when Turnstile verification fails", async () => {
    const fetchMock = routingFetchMock({ turnstile: turnstileFailureResponse() });
    const request = makeRequest(validPayload);
    await expect(callPost(request, { fetchMock, platform: mockPlatform() })).rejects.toMatchObject({
      status: 403,
    });
    const githubCall = fetchMock.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && args[0].includes("github"),
    );
    expect(githubCall).toBeUndefined();
  });

  it("rejects cross-origin requests", async () => {
    const request = makeRequest(validPayload, { origin: "https://evil.com" });
    await expect(callPost(request)).rejects.toMatchObject({ status: 403 });
  });

  it("returns 400 for non-JSON content type", async () => {
    const request = new Request("https://mistria.fyi/api/feedback", {
      body: "hello",
      headers: { "Content-Type": "text/plain", Origin: "https://mistria.fyi" },
      method: "POST",
    });
    await expect(callPost(request)).rejects.toMatchObject({ status: 400 });
  });
});

describe("POST /api/feedback GitHub credentials", () => {
  it("files the issue with an App installation token when the App is configured", async () => {
    const fetchMock = routingFetchMock();
    const response = await callPost(makeRequest(validPayload), {
      fetchMock,
      platform: appPlatform({ GITHUB_FEEDBACK_TOKEN: "" }),
    });

    expect(response.status).toBe(200);
    const exchangeCall = fetchMock.mock.calls.find((args: unknown[]) =>
      isExchange(String(args[0])),
    ) as [string, RequestInit] | undefined;
    expect(exchangeCall?.[0]).toBe("https://api.github.com/app/installations/7890/access_tokens");
    const [, options] = getGitHubCall(fetchMock);
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${INSTALLATION_TOKEN}`);
  });

  it("prefers the App over the fallback token", async () => {
    const fetchMock = routingFetchMock();
    await callPost(makeRequest(validPayload), { fetchMock, platform: appPlatform() });

    const [, options] = getGitHubCall(fetchMock);
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${INSTALLATION_TOKEN}`);
  });

  it("reuses the cached installation token across requests", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("turnstile")) return Promise.resolve(turnstileSuccessResponse());
      if (isExchange(url)) return Promise.resolve(installationTokenResponse());
      return Promise.resolve(githubSuccessResponse());
    });

    await callPost(makeRequest(validPayload), { fetchMock, platform: appPlatform() });
    await callPost(makeRequest(validPayload), { fetchMock, platform: appPlatform() });

    expect(countCalls(fetchMock, isExchange)).toBe(1);
    expect(countCalls(fetchMock, isIssue)).toBe(2);
  });

  it("drops the cached installation token when GitHub rejects it", async () => {
    vi.spyOn(console, "error").mockReturnValue(undefined);
    let issueStatus = 401;
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("turnstile")) return Promise.resolve(turnstileSuccessResponse());
      if (isExchange(url)) return Promise.resolve(installationTokenResponse());
      return Promise.resolve(
        issueStatus === 401
          ? Response.json({ message: "Bad credentials" }, { status: 401 })
          : githubSuccessResponse(),
      );
    });

    await expect(
      callPost(makeRequest(validPayload), { fetchMock, platform: appPlatform() }),
    ).rejects.toMatchObject({ status: 503 });
    issueStatus = 201;
    const response = await callPost(makeRequest(validPayload), {
      fetchMock,
      platform: appPlatform(),
    });

    expect(response.status).toBe(200);
    expect(countCalls(fetchMock, isExchange)).toBe(2);
  });

  it("falls back to the fine-grained token while the App is partly configured", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockReturnValue(undefined);
    const fetchMock = routingFetchMock();

    const response = await callPost(makeRequest(validPayload), {
      fetchMock,
      platform: appPlatform({ GITHUB_APP_PRIVATE_KEY: "" }),
    });

    expect(response.status).toBe(200);
    expect(countCalls(fetchMock, isExchange)).toBe(0);
    const [, options] = getGitHubCall(fetchMock);
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer ghp_test_token");
    expect(consoleWarn).toHaveBeenCalledWith(
      "GitHub App is partly configured (missing GITHUB_APP_PRIVATE_KEY); using GITHUB_FEEDBACK_TOKEN",
    );
    expectNoSecrets(consoleOutput(consoleWarn));
  });

  it("treats a whitespace-only private key as missing", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockReturnValue(undefined);
    const fetchMock = routingFetchMock();

    const response = await callPost(makeRequest(validPayload), {
      fetchMock,
      platform: appPlatform({ GITHUB_APP_PRIVATE_KEY: " \n " }),
    });

    expect(response.status).toBe(200);
    expect(countCalls(fetchMock, isExchange)).toBe(0);
    const [, options] = getGitHubCall(fetchMock);
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer ghp_test_token");
    expect(consoleWarn).toHaveBeenCalledWith(
      "GitHub App is partly configured (missing GITHUB_APP_PRIVATE_KEY); using GITHUB_FEEDBACK_TOKEN",
    );
  });

  it("uses the fine-grained token without a warning when no App setting exists", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockReturnValue(undefined);
    const fetchMock = routingFetchMock();

    await callPost(makeRequest(validPayload), { fetchMock, platform: mockPlatform() });

    const [, options] = getGitHubCall(fetchMock);
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer ghp_test_token");
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("returns 503 naming only the missing variables when no credentials exist", async () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue(undefined);
    const fetchMock = routingFetchMock();

    await expect(
      callPost(makeRequest(validPayload), {
        fetchMock,
        platform: mockPlatform({ tokenMissing: true }),
      }),
    ).rejects.toMatchObject({ status: 503 });

    expect(consoleError).toHaveBeenCalledWith(
      "GitHub credentials are not configured: missing GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_FEEDBACK_TOKEN",
    );
    expect(countCalls(fetchMock, (url) => new URL(url).host === "api.github.com")).toBe(0);
  });

  it("returns 503 & logs only status & request ID when the token exchange fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue(undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockReturnValue(undefined);
    const fetchMock = routingFetchMock({
      installationToken: Response.json(
        { message: "A JSON web token could not be decoded" },
        { headers: { "X-GitHub-Request-Id": "request-456" }, status: 401 },
      ),
    });

    await expect(
      callPost(makeRequest(validPayload), { fetchMock, platform: appPlatform() }),
    ).rejects.toMatchObject({ status: 503 });

    expect(consoleError).toHaveBeenCalledWith("GitHub App token exchange failed", {
      requestId: "request-456",
      status: 401,
    });
    expect(countCalls(fetchMock, isIssue)).toBe(0);
    expectNoSecrets(consoleOutput(consoleError, consoleWarn));
  });

  it("does not fall back to the fine-grained token when the App fails", async () => {
    vi.spyOn(console, "error").mockReturnValue(undefined);
    const fetchMock = routingFetchMock({
      installationToken: Response.json({}, { status: 500 }),
    });

    await expect(
      callPost(makeRequest(validPayload), { fetchMock, platform: appPlatform() }),
    ).rejects.toMatchObject({ status: 503 });
    expect(countCalls(fetchMock, isIssue)).toBe(0);
  });

  it("returns 503 without echoing key material when the private key is unusable", async () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue(undefined);
    const pkcs1 = testPrivateKeyPem.replaceAll("PRIVATE KEY", "RSA PRIVATE KEY");
    const fetchMock = routingFetchMock();

    await expect(
      callPost(makeRequest(validPayload), {
        fetchMock,
        platform: appPlatform({ GITHUB_APP_PRIVATE_KEY: pkcs1 }),
      }),
    ).rejects.toMatchObject({ status: 503 });

    expect(consoleError).toHaveBeenCalledWith(
      expect.stringMatching(/^GitHub App authentication failed: .*PKCS#8/),
    );
    expect(countCalls(fetchMock, (url) => new URL(url).host === "api.github.com")).toBe(0);
    expectNoSecrets(consoleOutput(consoleError));
  });

  it("returns 503 without logging the error when the token exchange request throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue(undefined);
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("turnstile")) return Promise.resolve(turnstileSuccessResponse());
      return Promise.reject(new TypeError("fetch failed"));
    });

    await expect(
      callPost(makeRequest(validPayload), { fetchMock, platform: appPlatform() }),
    ).rejects.toMatchObject({ status: 503 });
    expect(consoleError).toHaveBeenCalledWith("GitHub App token exchange request failed");
    expectNoSecrets(consoleOutput(consoleError));
  });
});

describe("OPTIONS /api/feedback", () => {
  it("returns CORS headers", async () => {
    const request = new Request("https://mistria.fyi/api/feedback", {
      headers: { Origin: "https://mistria.fyi" },
      method: "OPTIONS",
    });
    const response = await handleOptions({ request, url: makeUrl() } as Parameters<
      typeof handleOptions
    >[0]);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://mistria.fyi");
  });

  it("rejects cross-origin preflight requests", () => {
    const request = new Request("https://mistria.fyi/api/feedback", {
      headers: { Origin: "https://evil.com" },
      method: "OPTIONS",
    });

    expect(() =>
      handleOptions({ request, url: makeUrl() } as Parameters<typeof handleOptions>[0]),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
});
