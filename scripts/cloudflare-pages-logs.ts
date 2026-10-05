import { pathToFileURL } from "node:url";

interface BuildLogEntry {
  line: string;
  ts: string;
}

interface BuildLogResponse {
  result: {
    data: BuildLogEntry[];
    includes_container_logs: boolean;
    total: number;
  };
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchPagesDeploymentLogs(
  url: string,
  apiToken: string | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<BuildLogResponse> {
  const options: RequestInit = apiToken ? { headers: { Authorization: `Bearer ${apiToken}` } } : {};
  const response = await fetchImpl(url, options);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cloudflare returned HTTP ${response.status}: ${body}`);
  }

  return (await response.json()) as BuildLogResponse;
}

export function formatPagesDeploymentLogs(response: BuildLogResponse): string {
  return response.result.data.map(({ line, ts }) => `${ts} ${line}`).join("\n");
}

export function pagesDeploymentLogsUrl(
  accountId: string,
  deploymentId: string,
  projectName: string,
): string {
  const segments = [accountId, projectName, deploymentId].map((segment) =>
    encodeURIComponent(segment),
  );
  return `https://api.cloudflare.com/client/v4/accounts/${segments[0]}/pages/projects/${segments[1]}/deployments/${segments[2]}/history/logs`;
}

async function main(): Promise<void> {
  const deploymentId = process.argv[2];
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const projectName = process.env.CLOUDFLARE_PAGES_PROJECT ?? "mistria-fyi";

  if (!deploymentId) {
    throw new Error("Usage: pnpm run cloudflare:logs -- <deployment-id>");
  }
  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured");
  }

  const url = pagesDeploymentLogsUrl(accountId, deploymentId, projectName);
  const response = await fetchPagesDeploymentLogs(url, process.env.CLOUDFLARE_API_TOKEN);
  const output = formatPagesDeploymentLogs(response);
  console.log(output || "Cloudflare returned no build-log lines.");
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  try {
    await main();
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
