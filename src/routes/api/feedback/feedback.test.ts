import { describe, expect, it, vi } from "vitest";

import { OPTIONS, POST } from "./+server";

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
  { fetchMock, platform }: { fetchMock?: ReturnType<typeof vi.fn>; platform?: App.Platform } = {},
): Promise<Response> {
  const originalFetch = globalThis.fetch;
  if (fetchMock) {
    globalThis.fetch = fetchMock as typeof globalThis.fetch;
  }

  try {
    const url = makeUrl();
    return await POST({
      platform: platform ?? mockPlatform(),
      request,
      url,
    } as Parameters<typeof POST>[0]);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const turnstileSuccessResponse = () =>
  new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });

const turnstileFailureResponse = () =>
  new Response(JSON.stringify({ success: false }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });

const githubSuccessResponse = () =>
  new Response(
    JSON.stringify({
      html_url: "PR 99 (private beta)",
      number: 99,
    }),
    {
      headers: { "Content-Type": "application/json" },
      status: 201,
    },
  );

function getGitHubCall(fetchMock: ReturnType<typeof vi.fn>): [url: string, options: RequestInit] {
  const call = fetchMock.mock.calls.find(
    (args: unknown[]) => typeof args[0] === "string" && args[0].includes("github"),
  );
  if (!call) {
    throw new Error("No GitHub API call found");
  }
  return call as [string, RequestInit];
}

function mockGitHubFailure(status: number) {
  return routingFetchMock({
    github: new Response(JSON.stringify({ message: "error" }), {
      headers: { "Content-Type": "application/json" },
      status,
    }),
  });
}

function mockGitHubSuccess() {
  return routingFetchMock();
}

function mockPlatform(overrides?: {
  kvPutFail?: boolean;
  tokenMissing?: boolean;
  turnstileSecretMissing?: boolean;
}): App.Platform {
  return {
    env: {
      FEEDBACK_EMAIL_STORE: {
        put: overrides?.kvPutFail
          ? vi.fn().mockRejectedValue(new Error("KV write failed"))
          : vi.fn().mockResolvedValue(undefined),
      } as unknown as App.Platform["env"]["FEEDBACK_EMAIL_STORE"],
      GITHUB_FEEDBACK_TOKEN: overrides?.tokenMissing ? "" : "ghp_test_token",
      TURNSTILE_SECRET_KEY: overrides?.turnstileSecretMissing ? "" : "test-turnstile-secret",
    },
  };
}

function routingFetchMock(
  overrides: { github?: Response; turnstile?: Response } = {},
): ReturnType<typeof vi.fn> {
  return vi.fn((url: string) => {
    if (typeof url === "string" && url.includes("turnstile")) {
      return Promise.resolve(overrides.turnstile ?? turnstileSuccessResponse());
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
    expect(body.body).toContain("\u{1f4e7} Contact email provided");
    expect(body.body).not.toContain("user@example.com");
    expect(kvPut).toHaveBeenCalledWith("99", expect.stringContaining("user@example.com"));
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
    expect(issue.body).toContain("- **ID:** tomato\\_soup");
    expect(issue.body).toContain("- **Page:** /recipes");
    expect(issue.body).toContain("- **level:** 2");
    expect(issue.body).toContain("- **cookbook:** Mistrian Kitchen");
  });

  it.each([
    ["missing category", { displayName: "Tomato Soup", page: "/recipes" }],
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
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchMock = routingFetchMock({
      github: new Response(
        JSON.stringify({
          message: "Resource not accessible by personal access token\nwith extra detail",
        }),
        {
          headers: {
            "Content-Type": "application/json",
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
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await callPost(request, { fetchMock, platform });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { emailSaved?: boolean; issueUrl: string };
    expect(data.emailSaved).toBe(false);
  });

  it("reports emailSaved: false when KV binding is missing", async () => {
    const fetchMock = mockGitHubSuccess();
    const request = makeRequest({ ...validPayload, email: "user@example.com" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const platform = {
      env: {
        GITHUB_FEEDBACK_TOKEN: "ghp_test_token",
        TURNSTILE_SECRET_KEY: "test-turnstile-secret",
      },
    } as unknown as App.Platform;

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
    const request = makeRequest({ ...validPayload, turnstileToken: 12345 });
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

describe("OPTIONS /api/feedback", () => {
  it("returns CORS headers", async () => {
    const request = new Request("https://mistria.fyi/api/feedback", {
      headers: { Origin: "https://mistria.fyi" },
      method: "OPTIONS",
    });
    const response = await OPTIONS({ request, url: makeUrl() } as Parameters<typeof OPTIONS>[0]);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://mistria.fyi");
  });

  it("rejects cross-origin preflight requests", () => {
    const request = new Request("https://mistria.fyi/api/feedback", {
      headers: { Origin: "https://evil.com" },
      method: "OPTIONS",
    });

    expect(() => OPTIONS({ request, url: makeUrl() } as Parameters<typeof OPTIONS>[0])).toThrow(
      expect.objectContaining({ status: 403 }),
    );
  });
});
