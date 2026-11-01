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

/** The build-time deployment flag; tests run as production unless they opt into a preview build. */
const deployment = vi.hoisted(() => ({ isProductionDeployment: true }));
const syncSwitch = vi.hoisted(() => ({ syncSwitchOn: true }));
vi.mock("#lib/sync/sync-switch.js", () => syncSwitch);

vi.mock("#lib/server/deployment.js", () => deployment);

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
  deployment.isProductionDeployment = true;
});

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
  env?: Partial<WorkerEnv>;
  kvPutFail?: boolean;
  turnstileSecretMissing?: boolean;
}): {
  env: WorkerEnv;
} {
  return {
    env: {
      FEEDBACK_EMAIL_STORE: {
        put: overrides?.kvPutFail
          ? vi.fn().mockRejectedValue(new Error("KV write failed"))
          : vi.fn().mockResolvedValue(undefined),
      } as unknown as { env: WorkerEnv }["env"]["FEEDBACK_EMAIL_STORE"],
      GITHUB_APP_ID: "123456",
      GITHUB_APP_INSTALLATION_ID: "7890",
      GITHUB_APP_PRIVATE_KEY: testPrivateKeyPem,
      TURNSTILE_SECRET_KEY: overrides?.turnstileSecretMissing ? "" : "test-turnstile-secret",
      ...overrides?.env,
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

const MAX_BODY_BYTES = 65_536;
const syncEvent = (id: string) => ({
  farmHash: null,
  gameVersion: null,
  outcome: "applied",
  policies: [],
  unknownFields: [
    { field: "almanac", ids: [id, ...Array.from({ length: 19 }, () => "x".repeat(40))] },
  ],
});
const longSyncLog = (events: number) => ({
  appBuild: "build",
  events: Array.from({ length: events }, (_, i) => syncEvent(`event_${String(i)}`)),
  lane: "manual",
  protocolVersion: 1,
});
/** Fills a list so the compact JSON comes to about `bytes`. */
const filledSaveData = (bytes: number) => ({
  almanac: Array.from({ length: Math.floor(bytes / 14) }, () => "item_000000"),
});
async function fileIssue(payload: Record<string, unknown>): Promise<string> {
  const fetchMock = mockGitHubSuccess();
  const response = await callPost(makeRequest({ ...validPayload, ...payload }), { fetchMock });
  expect(response.status).toBe(200);
  const [, options] = getGitHubCall(fetchMock);
  return (JSON.parse(options.body as string) as { body: string }).body;
}
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
const fenced = (body: string, heading: string): unknown => {
  const section = body.slice(body.indexOf(heading));
  const start = section.indexOf("```json\n") + "```json\n".length;
  return JSON.parse(section.slice(start, section.indexOf("\n```", start)));
};

describe("POST /api/feedback", () => {
  it("excludes unclassified progress and provenance fields from older clients", async () => {
    const body = await fileIssue({
      saveData: {
        futureField: { characterName: "private-character" },
        provenance: { renown: { farmName: "private-farm", source: "save" } },
        renown: 7,
      },
    });
    expect(fenced(body, "<summary>Save data")).toEqual({
      provenance: { renown: { source: "save" } },
      renown: 7,
    });
  });
  describe("fitting GitHub's issue body limit", () => {
    it("enforces the progress byte limit after redacting an older client's playtimes", async () => {
      const saveData = {
        provenance: Object.fromEntries(
          Array.from({ length: 1110 }, (_, i) => [
            `almanac/${String(i)}`,
            { playtime: 0, source: "save" },
          ]),
        ),
      };
      expect(bytes(JSON.stringify(saveData))).toBeLessThan(50 * 1024);
      const fetchMock = mockGitHubSuccess();
      await expect(
        callPost(makeRequest({ ...validPayload, message: "m".repeat(4000), saveData }), {
          fetchMock,
        }),
      ).rejects.toMatchObject({ body: { message: "Save data too large" }, status: 400 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("redacts playtimes a tab on an older build still sends, & tolerates odd shapes", async () => {
      const body = await fileIssue({
        saveData: {
          lastSavePlaytime: 4321,
          provenance: { odd: "shape", renown: { playtime: 4321, source: "save" } },
          renown: 7,
        },
      });
      expect(body).not.toContain("4321");
      expect(fenced(body, "<summary>Save data")).toEqual({
        lastSavePlaytime: "[redacted]",
        provenance: { odd: {}, renown: { playtime: "[redacted]", source: "save" } },
        renown: 7,
      });
    });

    it("keeps attachments pretty-printed when they fit", async () => {
      const body = await fileIssue({ saveData: { renown: 7 }, syncLog: longSyncLog(2) });
      expect(body).toContain('\n  "renown": 7\n');
      expect(body).toContain('\n  "appBuild": "build",\n');
      expect(body).not.toContain("left out");
    });

    it("compacts before giving up any events", async () => {
      const log = longSyncLog(20);
      expect(bytes(JSON.stringify(log, null, 2))).toBeLessThan(MAX_BODY_BYTES);
      const data = filledSaveData(30_000);
      const pretty = JSON.stringify(data, null, 2).length + JSON.stringify(log, null, 2).length;
      expect(pretty).toBeGreaterThan(MAX_BODY_BYTES);
      const body = await fileIssue({ saveData: data, syncLog: log });
      expect(bytes(body)).toBeLessThanOrEqual(MAX_BODY_BYTES);
      expect(body).not.toContain("left out");
      expect(fenced(body, "<summary>Sync log")).toEqual(log);
      expect(fenced(body, "<summary>Save data")).toEqual(data);
    });

    it("gives up the oldest events when compacting isn't enough", async () => {
      const log = longSyncLog(20);
      const data = filledSaveData(49_000);
      expect(bytes(JSON.stringify(data)) + bytes(JSON.stringify(log))).toBeGreaterThan(
        MAX_BODY_BYTES,
      );
      const body = await fileIssue({
        message: "m".repeat(4000),
        saveData: data,
        syncLog: log,
      });
      expect(bytes(body)).toBeLessThanOrEqual(MAX_BODY_BYTES);
      const kept = fenced(body, "<summary>Sync log") as typeof log;
      const omitted = log.events.length - kept.events.length;
      expect(omitted).toBeGreaterThan(0);
      expect(kept.events).toEqual(log.events.slice(omitted));
      expect(body).toContain(`Older events left out to fit the issue: ${String(omitted)}`);
      expect(fenced(body, "<summary>Save data")).toEqual(data);
    });
  });

  it("validates and formats an opted-in sync log, with production gated off", async () => {
    const syncLog = {
      appBuild: "build-123",
      events: [
        {
          farmHash: null,
          gameVersion: null,
          outcome: "unreadable",
          policies: [],
          unknownFields: [],
        },
      ],
      lane: "following",
      protocolVersion: 1,
    };
    const fetchMock = mockGitHubSuccess();
    await callPost(makeRequest({ ...validPayload, syncLog }), { fetchMock });
    const [, options] = getGitHubCall(fetchMock);
    const issue = JSON.parse(options.body as string) as { body: string };
    expect(issue.body).toContain("<summary>Sync log");
    expect(issue.body).toContain('"outcome": "unreadable"');
    await expect(
      callPost(makeRequest({ ...validPayload, syncLog: { ...syncLog, key: "secret" } })),
    ).rejects.toMatchObject({ status: 400 });
    syncSwitch.syncSwitchOn = false;
    try {
      const productionFetch = mockGitHubSuccess();
      await callPost(makeRequest({ ...validPayload, syncLog: { ...syncLog, key: "secret" } }), {
        fetchMock: productionFetch,
      });
      const [, productionOptions] = getGitHubCall(productionFetch);
      const productionIssue = JSON.parse(productionOptions.body as string) as { body: string };
      expect(productionIssue.body).not.toContain("Sync log");
      expect(productionIssue.body).not.toContain("secret");
    } finally {
      syncSwitch.syncSwitchOn = true;
    }
  });

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
      if (isExchange(url)) return Promise.resolve(installationTokenResponse());
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
    const platform = mockPlatform({ env: { FEEDBACK_EMAIL_STORE: undefined } });

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
      platform: mockPlatform(),
    });

    expect(response.status).toBe(200);
    const exchangeCall = fetchMock.mock.calls.find((args: unknown[]) =>
      isExchange(String(args[0])),
    ) as [string, RequestInit] | undefined;
    expect(exchangeCall?.[0]).toBe("https://api.github.com/app/installations/7890/access_tokens");
    const [, options] = getGitHubCall(fetchMock);
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${INSTALLATION_TOKEN}`);
  });

  it("uses the App even if an obsolete personal token binding remains", async () => {
    const fetchMock = routingFetchMock();
    const platform = mockPlatform();
    Object.assign(platform.env, { GITHUB_FEEDBACK_TOKEN: "ghp_test_token" });
    await callPost(makeRequest(validPayload), { fetchMock, platform });

    const [, options] = getGitHubCall(fetchMock);
    expect(new Headers(options.headers).get("Authorization")).toBe(`Bearer ${INSTALLATION_TOKEN}`);
  });

  it("reuses the cached installation token across requests", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("turnstile")) return Promise.resolve(turnstileSuccessResponse());
      if (isExchange(url)) return Promise.resolve(installationTokenResponse());
      return Promise.resolve(githubSuccessResponse());
    });

    await callPost(makeRequest(validPayload), { fetchMock, platform: mockPlatform() });
    await callPost(makeRequest(validPayload), { fetchMock, platform: mockPlatform() });

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
      callPost(makeRequest(validPayload), { fetchMock, platform: mockPlatform() }),
    ).rejects.toMatchObject({ status: 503 });
    issueStatus = 201;
    const response = await callPost(makeRequest(validPayload), {
      fetchMock,
      platform: mockPlatform(),
    });

    expect(response.status).toBe(200);
    expect(countCalls(fetchMock, isExchange)).toBe(2);
  });

  describe.each(["GITHUB_APP_ID", "GITHUB_APP_INSTALLATION_ID", "GITHUB_APP_PRIVATE_KEY"] as const)(
    "%s configuration",
    (name) => {
      it.each([undefined, "", " \n "])(
        "returns 503 for missing or blank value %j even with an obsolete personal token",
        async (value) => {
          const consoleError = vi.spyOn(console, "error").mockReturnValue(undefined);
          const fetchMock = routingFetchMock();
          const platform = mockPlatform({ env: { [name]: value } });
          Object.assign(platform.env, { GITHUB_FEEDBACK_TOKEN: "ghp_test_token" });

          await expect(
            callPost(makeRequest(validPayload), { fetchMock, platform }),
          ).rejects.toMatchObject({ status: 503 });

          expect(consoleError).toHaveBeenCalledWith(
            `GitHub credentials are not configured: missing ${name}`,
          );
          expect(countCalls(fetchMock, (url) => new URL(url).host === "api.github.com")).toBe(0);
          expectNoSecrets(consoleOutput(consoleError));
        },
      );
    },
  );

  it("returns 503 naming only the missing variables when no credentials exist", async () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue(undefined);
    const fetchMock = routingFetchMock();

    await expect(
      callPost(makeRequest(validPayload), {
        fetchMock,
        platform: mockPlatform({
          env: {
            GITHUB_APP_ID: undefined,
            GITHUB_APP_INSTALLATION_ID: undefined,
            GITHUB_APP_PRIVATE_KEY: undefined,
          },
        }),
      }),
    ).rejects.toMatchObject({ status: 503 });

    expect(consoleError).toHaveBeenCalledWith(
      "GitHub credentials are not configured: missing GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY",
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
      callPost(makeRequest(validPayload), { fetchMock, platform: mockPlatform() }),
    ).rejects.toMatchObject({ status: 503 });

    expect(consoleError).toHaveBeenCalledWith("GitHub App token exchange failed", {
      requestId: "request-456",
      status: 401,
    });
    expect(countCalls(fetchMock, isIssue)).toBe(0);
    expectNoSecrets(consoleOutput(consoleError, consoleWarn));
  });

  it("does not create an issue when the App exchange fails with a server error", async () => {
    vi.spyOn(console, "error").mockReturnValue(undefined);
    const fetchMock = routingFetchMock({
      installationToken: Response.json({}, { status: 500 }),
    });

    await expect(
      callPost(makeRequest(validPayload), { fetchMock, platform: mockPlatform() }),
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
        platform: mockPlatform({ env: { GITHUB_APP_PRIVATE_KEY: pkcs1 } }),
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
      callPost(makeRequest(validPayload), { fetchMock, platform: mockPlatform() }),
    ).rejects.toMatchObject({ status: 503 });
    expect(consoleError).toHaveBeenCalledWith("GitHub App token exchange request failed");
    expectNoSecrets(consoleOutput(consoleError));
  });
});

describe("POST /api/feedback on a preview build", () => {
  beforeEach(() => {
    deployment.isProductionDeployment = false;
  });

  it("verifies Turnstile, then returns a dry run without filing an issue or storing the email", async () => {
    const consoleInfo = vi.spyOn(console, "info").mockReturnValue(undefined);
    const fetchMock = routingFetchMock();
    const platform = mockPlatform();
    const response = await callPost(makeRequest({ ...validPayload, email: "user@example.com" }), {
      fetchMock,
      platform,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dryRun: true });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://mistria.fyi");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("turnstile");
    expect(platform.env.FEEDBACK_EMAIL_STORE?.put).not.toHaveBeenCalled();
    expect(consoleInfo).toHaveBeenCalledWith("Feedback dry run: no issue filed");
    expect(consoleOutput(consoleInfo)).not.toContain("user@example.com");
  });

  it("skips Turnstile verification when the preview has no secret", async () => {
    vi.spyOn(console, "info").mockReturnValue(undefined);
    const fetchMock = routingFetchMock();
    const response = await callPost(makeRequest(validPayload), {
      fetchMock,
      platform: mockPlatform({
        env: {
          GITHUB_APP_ID: undefined,
          GITHUB_APP_INSTALLATION_ID: undefined,
          GITHUB_APP_PRIVATE_KEY: undefined,
        },
        turnstileSecretMissing: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ dryRun: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still rejects a failed Turnstile check", async () => {
    const fetchMock = routingFetchMock({ turnstile: turnstileFailureResponse() });

    await expect(
      callPost(makeRequest(validPayload), { fetchMock, platform: mockPlatform() }),
    ).rejects.toMatchObject({ status: 403 });
    expect(countCalls(fetchMock, (url) => new URL(url).host === "api.github.com")).toBe(0);
  });

  it("still validates the payload & Turnstile token", async () => {
    const fetchMock = routingFetchMock();

    await expect(
      callPost(makeRequest({ ...validPayload, message: "" }), { fetchMock }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      callPost(makeRequest({ ...validPayload, turnstileToken: "" }), { fetchMock }),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still rejects cross-origin requests", async () => {
    await expect(
      callPost(makeRequest(validPayload, { origin: "https://evil.com" }), {
        fetchMock: routingFetchMock(),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("POST /api/feedback on a production build", () => {
  it("files the issue even when the request asks for a dry run or comes from a preview host", async () => {
    const fetchMock = routingFetchMock();
    const request = new Request("https://preview.mistria-fyi.pages.dev/api/feedback", {
      body: JSON.stringify({ ...validPayload, dryRun: true }),
      headers: {
        "CF-Pages-Branch": "preview",
        "Content-Type": "application/json",
        Origin: "https://preview.mistria-fyi.pages.dev",
        "X-Dry-Run": "1",
      },
      method: "POST",
    });
    cloudflarePlatform.env = mockPlatform().env;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as typeof globalThis.fetch;

    let response: Response;
    try {
      response = await handlePost({
        request,
        url: new URL(request.url),
      } as Parameters<typeof handlePost>[0]);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ issueUrl: "PR 99 (private beta)" });
    expect(countCalls(fetchMock, isIssue)).toBe(1);
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
