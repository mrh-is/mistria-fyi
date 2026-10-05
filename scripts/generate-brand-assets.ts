import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { trackerData } from "../src/lib/data/index.js";
import { getAllProgress } from "../src/lib/engine/progress.js";

import type { CompletedState } from "../src/lib/types/user-progress.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const STATIC = join(ROOT, "static");

const COLORS = {
  hairline: "#948a7c",
  ink: "#2e2a22",
  muted: "#6a6460",
  ochre: "#8a642e",
  paper: "#f7f5f0",
  raised: "#fdfcf9",
} as const;

const ribbonPaths = {
  category: "M 20 24 H 112 V 104 H 20 L 34 64 Z",
  favicon: "M 16 24 H 112 L 92 64 L 112 104 H 16 Z",
} as const;

const ogProgress = {
  completed: 1416,
  percent: 27,
  total: grandTotal(),
} as const;

async function createIcon(size: number, maskable = false): Promise<Buffer> {
  const inset = maskable ? size * (44 / 512) : 0;
  const scale = maskable ? (size - inset * 2) / 128 : (size * 4.5) / 512;
  const translateX = maskable ? inset : size * (-40 / 512);
  const translateY = maskable ? inset : size * (-38 / 512);
  const category = `<path d="${ribbonPaths.category}" transform="translate(${translateX} ${translateY}) scale(${scale})" fill="${COLORS.ochre}"/>`;
  const notebookSize = size * (maskable ? 0.25 : 0.36);
  return sharp(
    svg(
      `<rect width="100%" height="100%" fill="${COLORS.paper}"/>${category}${notebookIcon((size - notebookSize) / 2 + size * 0.035, (size - notebookSize) / 2, notebookSize)}`,
      size,
      size,
    ),
  )
    .png()
    .toBuffer();
}

async function createOgImage(): Promise<void> {
  const port = 48_171;
  const server = spawn(
    "pnpm",
    ["exec", "vite", "dev", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: ROOT,
      stdio: "ignore",
    },
  );
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop -- readiness polling must retry sequentially until the dev server answers
        await fetch(`http://127.0.0.1:${port}/dev/og-image`);
        break;
      } catch {
        // oxlint-disable-next-line eslint/no-await-in-loop -- delay between sequential readiness retries
        await sleep(100);
      }
    }
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { height: 630, width: 1200 } });
    await page.goto(`http://127.0.0.1:${port}/dev/og-image`, { waitUntil: "networkidle" });
    await page.screenshot({ path: join(STATIC, "og-image.png") });
    await browser.close();
  } finally {
    server.kill();
  }
}

function emptyCompletedState(): CompletedState {
  return {
    almanac: new Set(),
    almanacRecipes: new Set(),
    animalCosmetics: Object.fromEntries(
      Object.keys(trackerData.animals).map((id) => [id, new Set()]),
    ),
    animals: Object.fromEntries(Object.keys(trackerData.animals).map((id) => [id, new Set()])),
    childChoice: "undeclared",
    cosmetics: new Set(),
    dates: new Set(),
    hasUpperFloor: false,
    mines: { floor: 0, spells: new Set() },
    museum: new Set(),
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    unlockedPerks: new Set(),
    villagerLevels: {},
    villagerRelationships: {},
  };
}

function grandTotal(): number {
  const progress = getAllProgress({
    availabilityWindows: ["now", "anytime", "later"],
    completed: emptyCompletedState(),
    worldState: { season: "spring", weather: "calm" },
  });
  return Object.values(progress).reduce((total, category) => total + category.total, 0);
}

async function main(): Promise<void> {
  const favicon = sharp(svg(`<path d="${ribbonPaths.favicon}" fill="${COLORS.ochre}"/>`, 128, 128));
  await Promise.all([
    favicon.png().toFile(join(STATIC, "favicon.png")),
    createIcon(180).then((image) => sharp(image).toFile(join(STATIC, "apple-touch-icon.png"))),
    createIcon(192).then((image) => sharp(image).toFile(join(STATIC, "icon-192.png"))),
    createIcon(192, true).then((image) =>
      sharp(image).toFile(join(STATIC, "icon-maskable-192.png")),
    ),
    createIcon(512).then((image) => sharp(image).toFile(join(STATIC, "icon-512.png"))),
    createIcon(512, true).then((image) =>
      sharp(image).toFile(join(STATIC, "icon-maskable-512.png")),
    ),
  ]);
  await createOgImage();
  console.log(
    `Generated brand assets with ${ogProgress.total.toLocaleString()} total trackable entries.`,
  );
}

function notebookIcon(x: number, y: number, size: number): string {
  return `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${COLORS.paper}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1m3 0v18"/><path d="M13 8l2 0"/><path d="M13 12l2 0"/></g>`;
}

function svg(content: string, width: number, height: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`,
  );
}

await main();
