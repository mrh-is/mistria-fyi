/* eslint-disable no-console -- server-side error logging */
import { error, isHttpError, json } from "@sveltejs/kit";

import type { ReportableElement } from "$lib/feedback/types.js";

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
const MAX_GITHUB_ERROR_LOG_LENGTH = 200;
const GITHUB_TIMEOUT_MS = 10_000;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TURNSTILE_TIMEOUT_MS = 5_000;

interface FeedbackPayload {
  appVersion: string;
  email?: string;
  gameDataVersion: string;
  message: string;
  saveData?: Record<string, unknown>;
  selectedElement?: ReportableElement;
}

interface GitHubFailureDiagnostics {
  acceptedPermissions: null | string;
  message?: string;
  requestId: null | string;
  status: number;
}

function buildIssueBody(payload: FeedbackPayload): string {
  const lines: string[] = [payload.message, "", "---", ""];

  lines.push(`**App version:** ${payload.appVersion}`);
  lines.push(`**Game data version:** ${payload.gameDataVersion}`);

  if (payload.email) {
    lines.push("");
    lines.push("\u{1f4e7} Contact email provided");
  }

  if (payload.saveData) {
    lines.push("");
    lines.push("<details>");
    lines.push("<summary>Save data (user-provided progress snapshot)</summary>");
    lines.push("");
    lines.push("\u{26a0}\u{fe0f} This data was voluntarily attached by the reporter.");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(payload.saveData, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("</details>");
  }

  if (payload.selectedElement) {
    const { category, displayName, entityId, extra, page } = payload.selectedElement;
    lines.push("", "**Selected element**");
    lines.push(`- **Category:** ${formatBodyValue(category)}`);
    lines.push(`- **Name:** ${formatBodyValue(displayName)}`);
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

  lines.push("");
  lines.push("*Submitted via in-app feedback*");

  return lines.join("\n");
}

function deriveTitle(payload: FeedbackPayload): string {
  if (payload.selectedElement) {
    const title = `[Feedback] ${sanitizeTitlePart(payload.selectedElement.category)}: ${sanitizeTitlePart(payload.selectedElement.displayName)}`;
    return truncateTitle(title, 256);
  }

  // eslint-disable-next-line no-control-regex -- stripping control characters from user input for issue title
  const sanitized = payload.message.replaceAll(/[\n\r\x00-\x1f]/g, " ").trim();
  if (sanitized.length <= 80) {
    return `[Feedback] ${sanitized}`;
  }
  const truncated = sanitized.slice(0, 80).replace(/\s+\S*$/, "");
  return `[Feedback] ${truncated}…`;
}

function escapeMarkdown(value: string): string {
  return value.replaceAll(/([*_`<>[\]\\|~#])/g, "\\$1");
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

function sanitizeTitlePart(value: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control characters from user input for issue title
  return value.replaceAll(/[\n\r\x00-\x1f]/g, " ").trim();
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
    error(400, "Invalid selected element");
  }
  return value;
}

function validatePayload(body: unknown): FeedbackPayload {
  if (typeof body !== "object" || body === null) {
    error(400, "Invalid request body");
  }

  const { appVersion, email, gameDataVersion, message, saveData, selectedElement } = body as Record<
    string,
    unknown
  >;

  if (typeof message !== "string" || message.trim().length === 0) {
    error(400, "Message is required");
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    error(400, "Message too long");
  }

  if (typeof appVersion !== "string" || appVersion.length === 0) {
    error(400, "App version is required");
  }
  if (appVersion.length > MAX_SHORT_STRING) {
    error(400, "App version too long");
  }

  if (typeof gameDataVersion !== "string" || gameDataVersion.length === 0) {
    error(400, "Game data version is required");
  }
  if (gameDataVersion.length > MAX_SHORT_STRING) {
    error(400, "Game data version too long");
  }

  if (email !== undefined && email !== null) {
    if (typeof email !== "string") {
      error(400, "Invalid email");
    }
    if (email.length > MAX_EMAIL_LENGTH) {
      error(400, "Email too long");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      error(400, "Invalid email format");
    }
  }

  let validatedSaveData: Record<string, unknown> | undefined;
  if (saveData !== undefined && saveData !== null) {
    if (typeof saveData !== "object" || Array.isArray(saveData)) {
      error(400, "Invalid save data");
    }
    if (new TextEncoder().encode(JSON.stringify(saveData)).byteLength > MAX_SAVE_DATA_BYTES) {
      error(400, "Save data too large");
    }
    validatedSaveData = saveData as Record<string, unknown>;
  }

  return {
    appVersion,
    email: typeof email === "string" ? email : undefined,
    gameDataVersion,
    message: message.trim(),
    saveData: validatedSaveData,
    selectedElement: validateSelectedElement(selectedElement),
  };
}

function validateSelectedElement(value: unknown): ReportableElement | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    error(400, "Invalid selected element");
  }

  const record = value as Record<string, unknown>;
  const allowedKeys = new Set(["category", "displayName", "entityId", "extra", "page"]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    error(400, "Invalid selected element");
  }

  const category = validateElementString(record.category);
  const displayName = validateElementString(record.displayName);
  const page = validateElementString(record.page);
  const entityId = record.entityId;
  if (
    entityId !== undefined &&
    (typeof entityId !== "string" || entityId.length > MAX_ENTITY_ID_LENGTH)
  ) {
    error(400, "Invalid selected element");
  }

  let extra: Record<string, number | string> | undefined;
  if (record.extra !== undefined) {
    if (typeof record.extra !== "object" || record.extra === null || Array.isArray(record.extra)) {
      error(400, "Invalid selected element");
    }
    const entries = Object.entries(record.extra);
    if (entries.length > MAX_EXTRA_KEYS) {
      error(400, "Invalid selected element");
    }
    if (
      entries.some(
        ([, extraValue]) =>
          (typeof extraValue !== "string" && typeof extraValue !== "number") ||
          (typeof extraValue === "number" && !Number.isFinite(extraValue)),
      )
    ) {
      error(400, "Invalid selected element");
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
      error(503, "Verification service unavailable. Please try again.");
    }

    const result = (await response.json()) as { success: boolean };
    if (!result.success) {
      error(403, "Verification failed. Please try again.");
    }
  } catch (err) {
    if (isHttpError(err)) {
      throw err;
    }
    console.error("Turnstile verification failed", err);
    error(503, "Verification service unavailable. Please try again.");
  } finally {
    clearTimeout(timeout);
  }
}

export const OPTIONS: RequestHandler = ({ request, url }) => {
  const origin = request.headers.get("origin") ?? "";

  if (origin && origin !== url.origin) {
    error(403, "Forbidden");
  }

  return new Response(null, {
    headers: corsHeaders(url.origin),
    status: 204,
  });
};

export const POST: RequestHandler = async ({ platform, request, url }) => {
  const origin = request.headers.get("origin");
  const allowedOrigin = url.origin;

  if (!origin || origin !== allowedOrigin) {
    error(403, "Forbidden");
  }

  const contentType = request.headers.get("content-type");
  if (!contentType?.includes("application/json")) {
    error(400, "Content-Type must be application/json");
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
    error(400, "Request body too large");
  }

  const rawText = await readBodyWithLimit(request, MAX_PAYLOAD_BYTES);

  let rawBody: unknown;
  try {
    rawBody = JSON.parse(rawText) as unknown;
  } catch {
    error(400, "Invalid JSON");
  }

  const payload = validatePayload(rawBody);

  const turnstileToken =
    typeof rawBody === "object" && rawBody !== null && "turnstileToken" in rawBody
      ? (rawBody as Record<string, unknown>).turnstileToken
      : undefined;
  if (typeof turnstileToken !== "string" || turnstileToken.length === 0) {
    error(400, "Verification token is required");
  }

  const turnstileSecret = platform?.env.TURNSTILE_SECRET_KEY;
  if (!turnstileSecret) {
    console.error("TURNSTILE_SECRET_KEY is not configured");
    error(503, "Feedback service temporarily unavailable");
  }
  await verifyTurnstile(turnstileToken, turnstileSecret);

  const token = platform.env.GITHUB_FEEDBACK_TOKEN;
  if (!token) {
    console.error("GITHUB_FEEDBACK_TOKEN is not configured");
    error(503, "Feedback service temporarily unavailable");
  }

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
      console.error("GitHub API error", await getGitHubFailureDiagnostics(response));
      error(
        503,
        "Feedback service temporarily unavailable. Please try again later or copy your message.",
      );
    }

    const result = (await response.json()) as { html_url: string; number: number };
    issueUrl = result.html_url;
    issueNumber = result.number;
    console.info("Feedback issue created", { issueNumber });
  } catch (err) {
    if (isHttpError(err)) {
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      console.error("GitHub API timeout");
    } else {
      console.error("GitHub API request failed", err);
    }
    error(
      503,
      "Feedback service temporarily unavailable. Please try again later or copy your message.",
    );
  } finally {
    clearTimeout(timeout);
  }

  let emailSaved: boolean | undefined;
  if (payload.email) {
    try {
      const emailStore = platform.env.FEEDBACK_EMAIL_STORE as
        App.Platform["env"]["FEEDBACK_EMAIL_STORE"] | undefined;
      if (!emailStore) {
        throw new Error("FEEDBACK_EMAIL_STORE is not configured");
      }
      await emailStore.put(
        String(issueNumber),
        JSON.stringify({ email: payload.email, timestamp: new Date().toISOString() }),
      );
      emailSaved = true;
    } catch (err) {
      console.error("KV write failure for issue", issueNumber, err);
      emailSaved = false;
    }
  }

  return json({ emailSaved, issueUrl }, { headers: corsHeaders(allowedOrigin) });
};

function corsHeaders(allowedOrigin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Max-Age": "86400",
  };
}

async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) {
    error(400, "Request body is required");
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- streaming loop
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      reader.cancel().catch(() => undefined);
      error(400, "Request body too large");
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(
    chunks.length === 1
      ? chunks[0]
      : chunks.reduce((acc, chunk) => {
          const merged = new Uint8Array(acc.byteLength + chunk.byteLength);
          merged.set(acc);
          merged.set(chunk, acc.byteLength);
          return merged;
        }, new Uint8Array(0)),
  );
}
