import { spawn } from "node:child_process";

export type OpAgentRead = (reference: string) => Promise<string>;

export async function readOpSecret(reference: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn("op-agent", ["read", reference], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error("op-agent is not installed; see docs/machine-setup.md."));
      } else {
        reject(error);
      }
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trimEnd());
      } else {
        reject(new Error(stderr.trim() || "op-agent could not read the requested secret."));
      }
    });
  });
}

export async function loadOpSecrets(
  values: Readonly<Record<string, string>>,
  env: NodeJS.ProcessEnv = process.env,
  read: OpAgentRead = readOpSecret,
): Promise<void> {
  await Promise.all(
    Object.entries(values).map(async ([name, reference]) => {
      // oxlint-disable-next-line typescript/prefer-nullish-coalescing -- Empty shell values are unset in this project.
      env[name] ||= await read(reference);
    }),
  );
}
