import { beforeAll, describe, expect, it, vi } from "vitest";

import { generateTestRsaKey } from "#lib/test-utils/rsa-test-key.js";

import {
  createAppJwt,
  createInstallationTokenProvider,
  GitHubAppAuthError,
} from "./github-app-auth.js";

import type { GitHubAppCredentials } from "./github-app-auth.js";

// A throwaway key generated per run; nothing here is a real GitHub App credential.
let publicKey: CryptoKey;
let privateKeyPem: string;

beforeAll(async () => {
  ({ privateKeyPem, publicKey } = await generateTestRsaKey());
});

const NOW_MS = Date.UTC(2026, 9, 22, 12, 0, 0);
const NOW_SECONDS = NOW_MS / 1000;

function credentials(overrides: Partial<GitHubAppCredentials> = {}): GitHubAppCredentials {
  return { appId: "123456", installationId: "7890", privateKeyPem, ...overrides };
}

function base64UrlDecode(segment: string): Uint8Array<ArrayBuffer> {
  const base64 = segment.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return new Uint8Array(Array.from(atob(padded), (char) => char.codePointAt(0) ?? 0));
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as unknown;
}

function tokenResponse(token: string, expiresAt: Date, headers: HeadersInit = {}): Response {
  return Response.json(
    { expires_at: expiresAt.toISOString(), permissions: { issues: "write" }, token },
    { headers, status: 201 },
  );
}

describe("createAppJwt", () => {
  it("signs an RS256 JWT with the App ID & a backdated, nine-minute window", async () => {
    const jwt = await createAppJwt("123456", privateKeyPem, NOW_MS);
    const [header, payload, signature] = jwt.split(".");

    expect(decodeSegment(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decodeSegment(payload)).toEqual({
      exp: NOW_SECONDS + 9 * 60,
      iat: NOW_SECONDS - 60,
      iss: "123456",
    });
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      base64UrlDecode(signature),
      new TextEncoder().encode(`${header}.${payload}`),
    );
    expect(verified).toBe(true);
  });

  it("uses unpadded base64url segments", async () => {
    const jwt = await createAppJwt("123456", privateKeyPem, NOW_MS);

    expect(jwt.split(".")).toHaveLength(3);
    expect(jwt).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it("accepts a key stored with escaped newlines", async () => {
    const escaped = privateKeyPem.replaceAll("\n", String.raw`\n`);

    await expect(createAppJwt("123456", escaped, NOW_MS)).resolves.toMatch(/^[\w-]+\./);
  });

  it("rejects a PKCS#1 key without echoing it", async () => {
    const pkcs1 = privateKeyPem.replaceAll("PRIVATE KEY", "RSA PRIVATE KEY");

    await expect(createAppJwt("123456", pkcs1, NOW_MS)).rejects.toMatchObject({
      message: expect.not.stringContaining(privateKeyPem.split("\n")[1]) as unknown,
      name: "GitHubAppAuthError",
    });
    await expect(createAppJwt("123456", pkcs1, NOW_MS)).rejects.toThrow(/PKCS#8/);
  });

  it("rejects key material that does not import, without echoing it", async () => {
    await expect(
      createAppJwt(
        "123456",
        "-----BEGIN PRIVATE KEY-----\nbm90LWEta2V5\n-----END PRIVATE KEY-----",
        NOW_MS,
      ),
    ).rejects.toMatchObject({
      message: expect.not.stringContaining("bm90LWEta2V5") as unknown,
      name: "GitHubAppAuthError",
    });
  });
});

describe("createInstallationTokenProvider", () => {
  it("exchanges the App JWT for an installation token", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(tokenResponse("ghs_installation_1", new Date(NOW_MS + 60 * 60 * 1000))),
    );
    const provider = createInstallationTokenProvider({ fetch: fetchMock, now: () => NOW_MS });

    await expect(provider.getToken(credentials())).resolves.toBe("ghs_installation_1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/app/installations/7890/access_tokens");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("Accept")).toBe("application/vnd.github+json");
    expect(headers.get("X-GitHub-Api-Version")).toBe("2022-11-28");
    expect(headers.get("User-Agent")).toBe("Mistria-Field-Guide-Feedback");
    const authorization = headers.get("Authorization") ?? "";
    expect(authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    const [, payload] = authorization.slice("Bearer ".length).split(".");
    expect(decodeSegment(payload)).toMatchObject({ iss: "123456" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("encodes the installation ID into the request path", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(tokenResponse("ghs_installation_1", new Date(NOW_MS + 60 * 60 * 1000))),
    );
    const provider = createInstallationTokenProvider({ fetch: fetchMock, now: () => NOW_MS });

    await provider.getToken(credentials({ installationId: "../../user" }));

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://api.github.com/app/installations/..%2F..%2Fuser/access_tokens");
  });

  it("reuses the cached token until five minutes before it expires", async () => {
    let now = NOW_MS;
    const expiresAt = new Date(NOW_MS + 60 * 60 * 1000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("ghs_first", expiresAt))
      .mockResolvedValueOnce(tokenResponse("ghs_second", new Date(NOW_MS + 2 * 60 * 60 * 1000)));
    const provider = createInstallationTokenProvider({ fetch: fetchMock, now: () => now });

    await expect(provider.getToken(credentials())).resolves.toBe("ghs_first");
    now = expiresAt.getTime() - 5 * 60 * 1000 - 1;
    await expect(provider.getToken(credentials())).resolves.toBe("ghs_first");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    now = expiresAt.getTime() - 5 * 60 * 1000;
    await expect(provider.getToken(credentials())).resolves.toBe("ghs_second");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight exchange between concurrent callers", async () => {
    let resolveExchange: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveExchange = resolve;
        }),
    );
    const provider = createInstallationTokenProvider({ fetch: fetchMock, now: () => NOW_MS });

    const first = provider.getToken(credentials());
    const second = provider.getToken(credentials());
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    resolveExchange?.(tokenResponse("ghs_shared", new Date(NOW_MS + 60 * 60 * 1000)));

    await expect(Promise.all([first, second])).resolves.toEqual(["ghs_shared", "ghs_shared"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a token cached for another installation", async () => {
    const expiresAt = new Date(NOW_MS + 60 * 60 * 1000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("ghs_first", expiresAt))
      .mockResolvedValueOnce(tokenResponse("ghs_other", expiresAt));
    const provider = createInstallationTokenProvider({ fetch: fetchMock, now: () => NOW_MS });

    await provider.getToken(credentials());
    await expect(provider.getToken(credentials({ installationId: "4242" }))).resolves.toBe(
      "ghs_other",
    );
  });

  it("refreshes after the cache is cleared", async () => {
    const expiresAt = new Date(NOW_MS + 60 * 60 * 1000);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("ghs_first", expiresAt))
      .mockResolvedValueOnce(tokenResponse("ghs_second", expiresAt));
    const provider = createInstallationTokenProvider({ fetch: fetchMock, now: () => NOW_MS });

    await provider.getToken(credentials());
    provider.clear();

    await expect(provider.getToken(credentials())).resolves.toBe("ghs_second");
  });

  it("reports only status & request ID when GitHub refuses the exchange", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json(
          { message: "A JSON web token could not be decoded" },
          { headers: { "X-GitHub-Request-Id": "request-abc" }, status: 401 },
        ),
      ),
    );
    const provider = createInstallationTokenProvider({ fetch: fetchMock, now: () => NOW_MS });

    await expect(provider.getToken(credentials())).rejects.toMatchObject({
      diagnostics: { requestId: "request-abc", status: 401 },
      name: "GitHubAppAuthError",
    });
  });

  it("retries after a failed exchange instead of caching the failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 500 }))
      .mockResolvedValueOnce(tokenResponse("ghs_retry", new Date(NOW_MS + 60 * 60 * 1000)));
    const provider = createInstallationTokenProvider({ fetch: fetchMock, now: () => NOW_MS });

    await expect(provider.getToken(credentials())).rejects.toBeInstanceOf(GitHubAppAuthError);
    await expect(provider.getToken(credentials())).resolves.toBe("ghs_retry");
  });

  it("rejects a response without a usable token or expiry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ expires_at: "soon", token: "ghs_x" }, { status: 201 }))
      .mockResolvedValueOnce(
        Response.json({ expires_at: new Date(NOW_MS).toISOString() }, { status: 201 }),
      );
    const provider = createInstallationTokenProvider({ fetch: fetchMock, now: () => NOW_MS });

    await expect(provider.getToken(credentials())).rejects.toBeInstanceOf(GitHubAppAuthError);
    await expect(provider.getToken(credentials())).rejects.toBeInstanceOf(GitHubAppAuthError);
  });

  it("aborts an exchange that outlives its timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      );
      const provider = createInstallationTokenProvider({
        fetch: fetchMock,
        now: () => NOW_MS,
        timeoutMs: 1000,
      });

      const pending = provider.getToken(credentials());
      // Marks the rejection handled until the assertion below awaits it.
      const settled = Promise.allSettled([pending]);
      // Signing runs on real crypto work, so the timer starts only once the request is sent.
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
      await vi.advanceTimersByTimeAsync(1000);

      await settled;
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    } finally {
      vi.useRealTimers();
    }
  });
});
