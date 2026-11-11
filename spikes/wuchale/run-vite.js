import { createBuilder, createServer } from "vite";

// The Cloudflare adapter resolves some build paths from cwd, independently of Vite's root.
process.chdir(import.meta.dirname);
const [command] = process.argv.slice(2);

if (command === "build") {
  const builder = await createBuilder();
  await builder.buildApp();
} else if (command === "dev") {
  const server = await createServer({ server: { port: 4380, strictPort: true } });
  await server.listen();
  server.printUrls();
} else {
  throw new Error("Expected build or dev");
}
