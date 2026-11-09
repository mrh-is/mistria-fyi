import { createBuilder, createServer } from "vite";

// The Cloudflare adapter resolves some build paths from cwd, independently of Vite's root.
process.chdir(import.meta.dirname);
const [command, variant] = process.argv.slice(2);
const mode = variant === "paraglide" ? "paraglide" : undefined;

if (command === "build") {
  const builder = await createBuilder({ mode });
  await builder.buildApp();
} else if (command === "dev") {
  const server = await createServer({ mode, server: { port: 4380, strictPort: true } });
  await server.listen();
  server.printUrls();
} else {
  throw new Error("Expected build or dev");
}
