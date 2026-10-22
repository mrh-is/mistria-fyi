/**
 * GitHub App authentication for server routes: signs an App JWT with Web Crypto, exchanges it for an
 * installation access token, & caches that token per isolate until shortly before it expires.
 *
 * Nothing here logs. Errors carry only fixed messages and, for refused exchanges, GitHub's status &
 * request ID, so callers can log them without leaking the private key, the JWT, or a token.
 */

const GITHUB_API = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const USER_AGENT = "Mistria-Field-Guide-Feedback";

/** GitHub rejects an `iat` in the future, so backdate it to absorb clock drift. */
const JWT_BACKDATE_SECONDS = 60;
/** GitHub caps an App JWT at ten minutes; stay under it. */
const JWT_LIFETIME_SECONDS = 9 * 60;
/** Refresh this long before GitHub's `expires_at`, so a request never starts with a stale token. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface GitHubAppCredentials {
  /** The App ID (or client ID), used as the JWT issuer. */
  appId: string;
  installationId: string;
  /** A PKCS#8 PEM (`BEGIN PRIVATE KEY`). GitHub downloads PKCS#1, which must be converted first. */
  privateKeyPem: string;
}

export interface GitHubAppFailureDiagnostics {
  requestId: null | string;
  status: number;
}

/** A GitHub App authentication failure whose message & diagnostics are safe to log. */
export class GitHubAppAuthError extends Error {
  readonly diagnostics: GitHubAppFailureDiagnostics | undefined;

  constructor(message: string, diagnostics?: GitHubAppFailureDiagnostics) {
    super(message);
    this.name = "GitHubAppAuthError";
    this.diagnostics = diagnostics;
  }
}

interface CachedToken {
  key: string;
  refreshAt: number;
  token: string;
}

interface InFlightExchange {
  key: string;
  promise: Promise<CachedToken>;
}

interface InstallationTokenProvider {
  /** Drops the cached token, e.g. after GitHub rejects it. */
  clear: () => void;
  getToken: (credentials: GitHubAppCredentials) => Promise<string>;
}

interface InstallationTokenProviderOptions {
  /** Defaults to the global `fetch`, looked up per call. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /** Milliseconds since the epoch. Defaults to `Date.now`. */
  now?: () => number;
  timeoutMs?: number;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

/** Decodes a PKCS#8 PEM body, accepting newlines stored as literal `\n` (a common env-var paste). */
function decodePkcs8Pem(pem: string): Uint8Array<ArrayBuffer> {
  const normalized = pem.replaceAll(String.raw`\n`, "\n");
  if (normalized.includes("-----BEGIN RSA PRIVATE KEY-----")) {
    throw new GitHubAppAuthError(
      "GitHub App private key is PKCS#1; convert it to PKCS#8 (BEGIN PRIVATE KEY) first",
    );
  }
  if (!normalized.includes("-----BEGIN PRIVATE KEY-----")) {
    throw new GitHubAppAuthError("GitHub App private key is not a PKCS#8 PEM (BEGIN PRIVATE KEY)");
  }
  const body = normalized
    .replaceAll(/-----(?:BEGIN|END) PRIVATE KEY-----/g, "")
    .replaceAll(/\s/g, "");
  let binary: string;
  try {
    binary = atob(body);
  } catch {
    throw new GitHubAppAuthError("GitHub App private key is not valid base64");
  }
  return Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const der = decodePkcs8Pem(pem);
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      der,
      { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
      false,
      ["sign"],
    );
  } catch {
    // The underlying error adds nothing a maintainer can act on, so it is not chained.
    throw new GitHubAppAuthError("GitHub App private key could not be imported as an RSA key");
  }
}

/** Signs a GitHub App JWT (RS256) valid from a minute before `nowMs` for nine minutes. */
export async function createAppJwt(
  appId: string,
  privateKeyPem: string,
  nowMs: number,
): Promise<string> {
  const key = await importPrivateKey(privateKeyPem);
  const nowSeconds = Math.floor(nowMs / 1000);
  const signingInput = `${base64UrlEncodeJson({ alg: "RS256", typ: "JWT" })}.${base64UrlEncodeJson({
    exp: nowSeconds + JWT_LIFETIME_SECONDS,
    iat: nowSeconds - JWT_BACKDATE_SECONDS,
    iss: appId,
  })}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function parseTokenResponse(body: unknown): { expiresAt: number; token: string } {
  if (typeof body === "object" && body !== null) {
    const { expires_at: expiresAtText, token } = body as Record<string, unknown>;
    const expiresAt = typeof expiresAtText === "string" ? Date.parse(expiresAtText) : Number.NaN;
    if (typeof token === "string" && token.length > 0 && Number.isFinite(expiresAt)) {
      return { expiresAt, token };
    }
  }
  throw new GitHubAppAuthError("GitHub App token response had no usable token or expiry");
}

/**
 * Creates a token provider with its own cache. Concurrent callers share one in-flight exchange, and
 * a failed exchange is never cached, so the next call retries.
 */
export function createInstallationTokenProvider(
  options: InstallationTokenProviderOptions = {},
): InstallationTokenProvider {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchFn = options.fetch ?? ((url: string, init: RequestInit) => fetch(url, init));
  let cached: CachedToken | undefined;
  let inFlight: InFlightExchange | undefined;

  async function exchange(credentials: GitHubAppCredentials, key: string): Promise<CachedToken> {
    const jwt = await createAppJwt(credentials.appId, credentials.privateKeyPem, now());
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchFn(
        `${GITHUB_API}/app/installations/${encodeURIComponent(credentials.installationId)}/access_tokens`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${jwt}`,
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": GITHUB_API_VERSION,
          },
          method: "POST",
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new GitHubAppAuthError("GitHub App token exchange was refused", {
          requestId: response.headers.get("x-github-request-id"),
          status: response.status,
        });
      }
      const { expiresAt, token } = parseTokenResponse(await readJson(response));
      return { key, refreshAt: expiresAt - REFRESH_MARGIN_MS, token };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Runs one exchange & caches its result; `inFlight` points at this call until it settles. */
  async function refresh(credentials: GitHubAppCredentials, key: string): Promise<CachedToken> {
    try {
      const fresh = await exchange(credentials, key);
      cached = fresh;
      return fresh;
    } finally {
      if (inFlight?.key === key) inFlight = undefined;
    }
  }

  return {
    clear() {
      cached = undefined;
    },
    async getToken(credentials) {
      const key = `${credentials.appId}:${credentials.installationId}`;
      if (cached?.key === key && now() < cached.refreshAt) {
        return cached.token;
      }
      if (inFlight?.key !== key) {
        inFlight = { key, promise: refresh(credentials, key) };
      }
      const fresh = await inFlight.promise;
      return fresh.token;
    },
  };
}

/** The isolate-wide provider the feedback endpoint uses; tests reset it with `clear()`. */
export const installationTokens = createInstallationTokenProvider();
