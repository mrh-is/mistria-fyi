// Fingerprints the Playwright preview server so a run never tests another checkout by accident.
//
// The preview wrapper (`playwright-preview.ts`) stamps the checkout path into the build output,
// where `vite preview` serves it as a static file. The Playwright config probes that file before
// starting its own server: Playwright launches `webServer` before `globalSetup`, so the probe
// has to run synchronously while the config loads. See #330.
import { execFileSync } from "node:child_process";

/** Served from the preview root; lives only in the local build output, never in `static/`. */
export const OWNER_FILE = "playwright-owner.json";

export interface PreviewOwner {
  checkout: string;
  startedAt: string;
}

export type PreviewProbe =
  | { kind: "foreign"; status: number }
  | { kind: "owner"; owner: PreviewOwner }
  | { kind: "unreachable" };

/** Explains why a run must not proceed against the server on the port, or null when it's free. */
export function assessPreviewProbe(
  probe: PreviewProbe,
  url: string,
  checkout: string,
): null | string {
  switch (probe.kind) {
    case "foreign":
      return (
        `${url} is already served by something that is not a Playwright preview ` +
        `(HTTP ${String(probe.status)} for /${OWNER_FILE}). ` +
        "Stop that process or set PLAYWRIGHT_PORT to a free port."
      );
    case "owner":
      if (probe.owner.checkout === checkout) {
        return (
          `${url} is still served by a Playwright preview from this checkout ` +
          `(started ${probe.owner.startedAt}). Stop it before starting another run.`
        );
      }
      return (
        `${url} is served by a Playwright preview from a different checkout:\n` +
        `  ${probe.owner.checkout}\n` +
        `This run would test that checkout instead of ${checkout}. ` +
        "Stop the other preview or set PLAYWRIGHT_PORT to a free port."
      );
    case "unreachable":
      return null;
  }
}

/** Turns the owner file's HTTP response into a probe result. */
export function classifyOwnerResponse(status: number, body: unknown): PreviewProbe {
  if (status !== 200) return { kind: "foreign", status };
  if (
    typeof body === "object" &&
    body !== null &&
    "checkout" in body &&
    typeof body.checkout === "string" &&
    "startedAt" in body &&
    typeof body.startedAt === "string"
  ) {
    return { kind: "owner", owner: { checkout: body.checkout, startedAt: body.startedAt } };
  }
  return { kind: "foreign", status };
}

// Runs in a child process so the config can await nothing: prints `{status, body}` or `null`.
const probeSource = `
const url = process.argv[1];
const response = await fetch(url).catch(() => null);
if (response === null) { process.stdout.write("null"); }
else {
  const body = await response.json().catch(() => null);
  process.stdout.write(JSON.stringify({ status: response.status, body }));
}
`;

/** Synchronously checks who, if anyone, is serving the preview URL. */
export function probePreviewOwner(baseUrl: string): PreviewProbe {
  const output = execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", probeSource, `${baseUrl}/${OWNER_FILE}`],
    { encoding: "utf8", timeout: 5000 },
  );
  const result = JSON.parse(output) as null | { body: unknown; status: number };
  if (result === null) return { kind: "unreachable" };
  return classifyOwnerResponse(result.status, result.body);
}
