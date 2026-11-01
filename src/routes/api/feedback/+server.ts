/* eslint-disable no-console -- server-side error logging */
import { error as httpError, isHttpError } from "@sveltejs/kit";
import { env } from "cloudflare:workers";
import * as v from "valibot";

import { progressAttachment } from "#lib/feedback/progress-attachment.js";
import { SyncLogSchema } from "#lib/feedback/sync-log-schema.js";
import { isReportCategory } from "#lib/feedback/types.js";
import { isProductionDeployment } from "#lib/server/deployment.js";
import { GitHubAppAuthError, installationTokens } from "#lib/server/github-app-auth.js";
import { syncSwitchOn } from "#lib/sync/sync-switch.js";

import type { SyncLog } from "#lib/feedback/sync-log-schema.js";
import type { ReportTarget } from "#lib/feedback/types.js";
import type { GitHubAppCredentials } from "#lib/server/github-app-auth.js";

import type { RequestHandler } from "./$types";

const REPO_OWNER = "mrh-is";
const REPO_NAME = "mistria-fyi";
const GITHUB_API = "https://api.github.com";
const MAX_MESSAGE_LENGTH = 5000;
const MAX_SHORT_STRING = 50;
const MAX_EMAIL_LENGTH = 254;
const MAX_ELEMENT_STRING_LENGTH = 200;
const MAX_ENTITY_ID_LENGTH = 100;
const MAX_EXTRA_KEYS = 10;
const MAX_SAVE_DATA_BYTES = 50 * 1024;
const MAX_PAYLOAD_BYTES = 100 * 1024;
/** GitHub counts characters; bytes are the stricter measure, & stay safe if that ever changes. */
const MAX_ISSUE_BODY_BYTES = 65_536;
const MAX_GITHUB_ERROR_LOG_LENGTH = 200;
const GITHUB_TIMEOUT_MS = 10_000;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 5000;

interface FeedbackPayload {
  appVersion: string;
  email?: string;
  gameDataVersion: string;
  message: string;
  saveData?: Record<string, unknown>;
  selectedElement?: ReportTarget;
  syncLog?: SyncLog;
}

interface GitHubFailureDiagnostics {
  acceptedPermissions: null | string;
  message?: string;
  requestId: null | string;
  status: number;
}

const GITHUB_APP_VARIABLES = [
  "GITHUB_APP_ID",
  "GITHUB_APP_INSTALLATION_ID",
  "GITHUB_APP_PRIVATE_KEY",
] as const;

const GITHUB_UNAVAILABLE_MESSAGE =
  "Feedback service temporarily unavailable. Please try again later or copy your message.";

function fitsIssueBody(body: string): boolean {
  return new TextEncoder().encode(body).byteLength <= MAX_ISSUE_BODY_BYTES;
}

/**
 * Pretty-prints attachments when they fit GitHub's body limit, or compacts them when they don't.
 * Past that, the sync log gives up its oldest events: a report is worth more than its whole log.
 */
function buildIssueBody(payload: FeedbackPayload): string {
  const pretty = composeIssueBody(payload, 2);
  if (fitsIssueBody(pretty)) return pretty;
  let body = composeIssueBody(payload);
  const events = payload.syncLog?.events ?? [];
  for (let omitted = 1; omitted <= events.length && !fitsIssueBody(body); omitted++) {
    const syncLog = payload.syncLog && { ...payload.syncLog, events: events.slice(omitted) };
    body = composeIssueBody({ ...payload, syncLog }, undefined, omitted);
  }
  return body;
}

function composeIssueBody(payload: FeedbackPayload, indent?: number, omittedEvents = 0): string {
  const lines: string[] = [
    escapeMentions(payload.message),
    "",
    "---",
    "",
    `**App version:** ${payload.appVersion}`,
    `**Game data version:** ${payload.gameDataVersion}`,
  ];

  if (payload.email) {
    lines.push("", "\u{1F4E7} Contact email provided");
  }

  if (payload.saveData) {
    lines.push(
      "",
      "<details>",
      "<summary>Save data (user-provided progress snapshot)</summary>",
      "",
      "\u{26A0}\u{FE0F} This data was voluntarily attached by the reporter.",
      "",
      "```json",
      JSON.stringify(payload.saveData, null, indent),
      "```",
      "",
      "</details>",
    );
  }

  if (syncSwitchOn && payload.syncLog) {
    lines.push(
      "",
      "<details>",
      "<summary>Sync log (names & credentials excluded)</summary>",
      "",
      ...(omittedEvents > 0
        ? [`Older events left out to fit the issue: ${String(omittedEvents)}`, ""]
        : []),
      "```json",
      JSON.stringify(payload.syncLog, null, indent),
      "```",
      "",
      "</details>",
    );
  }

  if (payload.selectedElement) {
    const { category, displayName, entityId, extra, page } = payload.selectedElement;
    lines.push(
      "",
      "**Selected element**",
      `- **Category:** ${formatBodyValue(category)}`,
      `- **Name:** ${formatBodyValue(displayName)}`,
    );
    if (entityId) {
      lines.push(`- **ID:** ${formatBodyValue(entityId)}`);
    }
    lines.push(`- **Page:** ${formatBodyValue(page)}`);
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        lines.push(`- **${formatBodyValue(key)}:** ${formatBodyValue(String(value))}`);
      }
    }
  }

  lines.push("", "*Submitted via in-app feedback*");

  return lines.join("\n");
}

function deriveTitle(payload: FeedbackPayload): string {
  if (payload.selectedElement) {
    const title = `[Feedback] ${sanitizeTitlePart(payload.selectedElement.category)}: ${sanitizeTitlePart(payload.selectedElement.displayName)}`;
    return truncateTitle(title, 256);
  }

  // eslint-disable-next-line no-control-regex -- stripping control characters from user input for issue title
  const sanitized = payload.message.replaceAll(/[\n\r\u0000-\u001F]/g, " ").trim();
  if (sanitized.length <= 80) {
    return `[Feedback] ${sanitized}`;
  }
  const truncated = sanitized.slice(0, 80).replace(/\s+\S*$/, "");
  return `[Feedback] ${truncated}…`;
}

function escapeMarkdown(value: string): string {
  return value.replaceAll(/([*_`<>[\]\\|~#@])/g, String.raw`\$1`);
}

/**
 * Backslash-escapes `@` so user-written text can't @-mention (and notify) GitHub users or teams.
 * The rest of the message stays Markdown, since reporters format it on purpose.
 */
function escapeMentions(value: string): string {
  return value.replaceAll("@", String.raw`\@`);
}

function formatBodyValue(value: string): string {
  return escapeMarkdown(value.replaceAll(/[\r\n]+/g, " ").trim());
}

async function getGitHubFailureDiagnostics(response: Response): Promise<GitHubFailureDiagnostics> {
  let message: string | undefined;

  try {
    const body = (await response.json()) as unknown;
    if (typeof body === "object" && body !== null && "message" in body) {
      const rawMessage = (body as Record<string, unknown>).message;
      if (typeof rawMessage === "string") {
        message = rawMessage.replaceAll(/\s+/g, " ").trim().slice(0, MAX_GITHUB_ERROR_LOG_LENGTH);
      }
    }
  } catch {
    // GitHub occasionally returns an empty or non-JSON error response.
  }

  return {
    acceptedPermissions: response.headers.get("x-accepted-github-permissions"),
    message,
    requestId: response.headers.get("x-github-request-id"),
    status: response.status,
  };
}

/**
 * Exchanges App credentials for an installation token. Logs only fixed messages, statuses, & request
 * IDs: never key material, JWTs, or tokens.
 */
async function getGitHubToken(credentials: GitHubAppCredentials): Promise<string> {
  try {
    return await installationTokens.getToken(credentials);
  } catch (error) {
    if (error instanceof GitHubAppAuthError) {
      if (error.diagnostics) {
        console.error("GitHub App token exchange failed", error.diagnostics);
      } else {
        console.error(`GitHub App authentication failed: ${error.message}`);
      }
    } else if (error instanceof Error && error.name === "AbortError") {
      console.error("GitHub App token exchange timeout");
    } else {
      console.error("GitHub App token exchange request failed");
    }
    httpError(503, GITHUB_UNAVAILABLE_MESSAGE);
  }
}

/** Requires all three GitHub App settings; logs only missing variable names. */
function resolveGitHubCredentials(): GitHubAppCredentials {
  const appId = env.GITHUB_APP_ID?.trim();
  const installationId = env.GITHUB_APP_INSTALLATION_ID?.trim();
  const privateKeyPem = env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (appId && installationId && privateKeyPem) {
    return { appId, installationId, privateKeyPem };
  }

  const missingAppVariables = GITHUB_APP_VARIABLES.filter((name) => !env[name]?.trim());
  console.error(`GitHub credentials are not configured: missing ${missingAppVariables.join(", ")}`);
  httpError(503, "Feedback service temporarily unavailable");
}

function sanitizeTitlePart(value: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control characters from user input for issue title
  return value.replaceAll(/[\n\r\u0000-\u001F]/g, " ").trim();
}

function truncateTitle(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const truncated = value
    .slice(0, maxLength - 1)
    .replace(/\s+\S*$/, "")
    .trimEnd();
  return `${truncated}…`;
}

function validateElementString(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > MAX_ELEMENT_STRING_LENGTH
  ) {
    httpError(400, "Invalid selected element");
  }
  return value;
}

function validatePayload(body: unknown): FeedbackPayload {
  if (typeof body !== "object" || body === null) {
    httpError(400, "Invalid request body");
  }

  const {
    appVersion,
    email,
    gameDataVersion,
    message,
    saveData,
    selectedElement,
    syncLog: rawSyncLog,
  } = body as Record<string, unknown>;

  if (typeof message !== "string" || message.trim().length === 0) {
    httpError(400, "Message is required");
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    httpError(400, "Message too long");
  }

  if (typeof appVersion !== "string" || appVersion.length === 0) {
    httpError(400, "App version is required");
  }
  if (appVersion.length > MAX_SHORT_STRING) {
    httpError(400, "App version too long");
  }

  if (typeof gameDataVersion !== "string" || gameDataVersion.length === 0) {
    httpError(400, "Game data version is required");
  }
  if (gameDataVersion.length > MAX_SHORT_STRING) {
    httpError(400, "Game data version too long");
  }

  if (email !== undefined && email !== null) {
    if (typeof email !== "string") {
      httpError(400, "Invalid email");
    }
    if (email.length > MAX_EMAIL_LENGTH) {
      httpError(400, "Email too long");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      httpError(400, "Invalid email format");
    }
  }

  let syncLog: SyncLog | undefined;
  if (syncSwitchOn && rawSyncLog !== undefined) {
    const parsed = v.safeParse(SyncLogSchema, rawSyncLog);
    if (!parsed.success) httpError(400, "Invalid sync log");
    syncLog = parsed.output;
  }

  let validatedSaveData: Record<string, unknown> | undefined;
  if (saveData !== undefined && saveData !== null) {
    if (typeof saveData !== "object" || Array.isArray(saveData)) {
      httpError(400, "Invalid save data");
    }
    if (new TextEncoder().encode(JSON.stringify(saveData)).byteLength > MAX_SAVE_DATA_BYTES) {
      httpError(400, "Save data too large");
    }
    validatedSaveData = progressAttachment(saveData as Record<string, unknown>);
    // Older clients send numbers; replacing short values with markers can enlarge the attachment.
    if (
      new TextEncoder().encode(JSON.stringify(validatedSaveData)).byteLength > MAX_SAVE_DATA_BYTES
    ) {
      httpError(400, "Save data too large");
    }
  }

  return {
    appVersion,
    email: typeof email === "string" ? email : undefined,
    gameDataVersion,
    message: message.trim(),
    saveData: validatedSaveData,
    selectedElement: validateSelectedElement(selectedElement),
    syncLog,
  };
}

function validateSelectedElement(value: unknown): ReportTarget | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    httpError(400, "Invalid selected element");
  }

  const record = value as Record<string, unknown>;
  const allowedKeys = new Set(["category", "displayName", "entityId", "extra", "page"]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    httpError(400, "Invalid selected element");
  }

  const category = validateElementString(record.category);
  if (!isReportCategory(category)) {
    httpError(400, "Invalid selected element");
  }
  const displayName = validateElementString(record.displayName);
  const page = validateElementString(record.page);
  const entityId = record.entityId;
  if (
    entityId !== undefined &&
    (typeof entityId !== "string" || entityId.length > MAX_ENTITY_ID_LENGTH)
  ) {
    httpError(400, "Invalid selected element");
  }

  let extra: Record<string, number | string> | undefined;
  if (record.extra !== undefined) {
    if (typeof record.extra !== "object" || record.extra === null || Array.isArray(record.extra)) {
      httpError(400, "Invalid selected element");
    }
    const entries = Object.entries(record.extra);
    if (entries.length > MAX_EXTRA_KEYS) {
      httpError(400, "Invalid selected element");
    }
    if (
      entries.some(
        ([, extraValue]) =>
          (typeof extraValue !== "string" && typeof extraValue !== "number") ||
          (typeof extraValue === "number" && !Number.isFinite(extraValue)),
      )
    ) {
      httpError(400, "Invalid selected element");
    }
    extra = Object.fromEntries(entries);
  }

  return { category, displayName, entityId, extra, page };
}

async function verifyTurnstile(token: string, secretKey: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, TURNSTILE_TIMEOUT_MS);

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      body: JSON.stringify({ response: token, secret: secretKey }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`Turnstile API error: ${String(response.status)}`);
      httpError(503, "Verification service unavailable. Please try again.");
    }

    const result = (await response.json()) as { success: boolean };
    if (!result.success) {
      httpError(403, "Verification failed. Please try again.");
    }
  } catch (error) {
    if (isHttpError(error)) {
      throw error;
    }
    console.error("Turnstile verification failed", error);
    httpError(503, "Verification service unavailable. Please try again.");
  } finally {
    clearTimeout(timeout);
  }
}

export const OPTIONS: RequestHandler = ({ request, url }) => {
  const origin = request.headers.get("origin") ?? "";

  if (origin && origin !== url.origin) {
    httpError(403, "Forbidden");
  }

  return new Response(null, {
    headers: corsHeaders(url.origin),
    status: 204,
  });
};

export const POST: RequestHandler = async ({ request, url }) => {
  const origin = request.headers.get("origin");
  const allowedOrigin = url.origin;

  if (!origin || origin !== allowedOrigin) {
    httpError(403, "Forbidden");
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    httpError(400, "Content-Type must be application/json");
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
    httpError(400, "Request body too large");
  }

  const rawText = await readBodyWithLimit(request, MAX_PAYLOAD_BYTES);

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(rawText) as unknown;
  } catch {
    httpError(400, "Invalid JSON");
  }

  const payload = validatePayload(rawBody);

  const turnstileToken =
    typeof rawBody === "object" && rawBody !== null && "turnstileToken" in rawBody
      ? (rawBody as Record<string, unknown>).turnstileToken
      : undefined;
  if (typeof turnstileToken !== "string" || turnstileToken.length === 0) {
    httpError(400, "Verification token is required");
  }

  const turnstileSecret = env.TURNSTILE_SECRET_KEY;
  if (!isProductionDeployment) {
    // Previews are public & hold no GitHub App secrets, so they check what they can & file nothing.
    if (turnstileSecret) {
      await verifyTurnstile(turnstileToken, turnstileSecret);
    }
    console.info("Feedback dry run: no issue filed");
    return Response.json({ dryRun: true }, { headers: corsHeaders(allowedOrigin) });
  }
  if (!turnstileSecret) {
    console.error("TURNSTILE_SECRET_KEY is not configured");
    httpError(503, "Feedback service temporarily unavailable");
  }
  await verifyTurnstile(turnstileToken, turnstileSecret);

  const token = await getGitHubToken(resolveGitHubCredentials());

  const title = deriveTitle(payload);
  const body = buildIssueBody(payload);

  let issueUrl: string;
  let issueNumber: number;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, GITHUB_TIMEOUT_MS);

  try {
    const response = await fetch(`${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/issues`, {
      body: JSON.stringify({
        body,
        labels: ["user feedback"],
        title,
      }),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "Mistria-Field-Guide-Feedback",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 401) {
        // GitHub no longer accepts this installation token, so the next request fetches one, unless
        // another request has already cached a newer token.
        installationTokens.clear(token);
      }
      console.error("GitHub API error", await getGitHubFailureDiagnostics(response));
      httpError(503, GITHUB_UNAVAILABLE_MESSAGE);
    }

    const result = (await response.json()) as { html_url: string; number: number };
    issueUrl = result.html_url;
    issueNumber = result.number;
    console.info("Feedback issue created", { issueNumber });
  } catch (error) {
    if (isHttpError(error)) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      console.error("GitHub API timeout");
    } else {
      console.error("GitHub API request failed", error);
    }
    httpError(503, GITHUB_UNAVAILABLE_MESSAGE);
  } finally {
    clearTimeout(timeout);
  }

  let emailSaved: boolean | undefined;
  if (payload.email) {
    try {
      const emailStore = env.FEEDBACK_EMAIL_STORE;
      if (!emailStore) {
        throw new Error("FEEDBACK_EMAIL_STORE is not configured");
      }
      await emailStore.put(
        String(issueNumber),
        JSON.stringify({ email: payload.email, timestamp: new Date().toISOString() }),
      );
      emailSaved = true;
    } catch (error) {
      console.error("KV write failure for issue", issueNumber, error);
      emailSaved = false;
    }
  }

  return Response.json({ emailSaved, issueUrl }, { headers: corsHeaders(allowedOrigin) });
};

function corsHeaders(allowedOrigin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Max-Age": "86400",
  };
}

async function cancelQuietly(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel();
  } catch {
    // The body is already being rejected; a failed cancel changes nothing.
  }
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const chunk of chunks) {
    totalLength += chunk.byteLength;
  }
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) {
    httpError(400, "Request body is required");
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- streaming loop
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- stream chunks must be read in order to enforce the size limit
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      void cancelQuietly(reader);
      httpError(400, "Request body too large");
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(chunks.length === 1 ? chunks[0] : concatChunks(chunks));
}
