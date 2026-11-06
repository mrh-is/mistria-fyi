import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import ts from "typescript";

import type { V4ModuleDefinition, V4SharedOptions, V4WorkerOptions } from "miniflare";

export const TEST_ADMIN = "placeholder-admin-token-for-local-tests";
export const TEST_ORIGIN = "https://relay.mistria.fyi";

export function relayTestModules(workerSuffix = ""): Promise<V4ModuleDefinition[]> {
  return Promise.all(
    ["worker", "wire"].map(async (name) => {
      const source = await readFile(new URL(`${name}.ts`, import.meta.url), "utf8");
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2024 },
      });
      return {
        type: "ESModule",
        contents: name === "worker" ? outputText + workerSuffix : outputText,
        path: `${name}.js`,
      };
    }),
  );
}

export function relayTestRuntime(
  modules: V4ModuleDefinition[],
  options: Pick<V4SharedOptions, "resourcePersistencePath"> &
    Pick<V4WorkerOptions, "durableObjects" | "outboundService"> = {},
): Miniflare {
  return new Miniflare(
    convertV4MiniflareOptions({
      bindings: {
        ADMIN_TOKEN: TEST_ADMIN,
        IP_RATE_SECRET: "placeholder-rate-secret-for-local-tests",
        TURNSTILE_HOSTNAME: "mistria.fyi",
        TURNSTILE_SECRET: "placeholder-turnstile-secret",
      },
      cf: false,
      compatibilityDate: "2026-10-26",
      durableObjects: {
        CONTROL: { className: "RelayControl", useSQLite: true },
        MAILBOXES: { className: "Mailbox", useSQLite: true },
      },
      modules,
      outboundService: () =>
        Response.json({ action: "sync-create", hostname: "mistria.fyi", success: true }),
      ratelimits: {
        CREATE_RATE: { namespace_id: "132", simple: { limit: 3, period: 60 } },
        READ_RATE: { namespace_id: "133", simple: { limit: 60, period: 60 } },
      },
      ...options,
    }),
  );
}

/** The real client transport, with the address Cloudflare would add at the edge. */
export function relayTestFetch(runtime: Miniflare, ip: string): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    request.headers.set("CF-Connecting-IP", ip);
    const response = await runtime.dispatchFetch(request.url, {
      body: request.body === null ? undefined : await request.arrayBuffer(),
      headers: request.headers,
      method: request.method,
      signal: request.signal,
    } as Parameters<Miniflare["dispatchFetch"]>[1]);
    return response as unknown as Response;
  };
}
