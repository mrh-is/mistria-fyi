import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import { trackerData } from "../src/lib/data/index.js";
import { getAllProgress } from "../src/lib/engine/progress.js";

import type { CompletedState } from "../src/lib/stores/user-state.svelte.js";

const STATIC = fileURLToPath(new URL("../static/", import.meta.url));

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
  favicon: "M 16 30 H 112 L 94 64 L 112 98 H 16 Z",
} as const;

const ogProgress = {
  completed: 1416,
  percent: 27,
  total: grandTotal(),
} as const;

function bookIcon(x: number, y: number, size: number): string {
  return `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${COLORS.paper}" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M19 4v16h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h12"/><path d="M19 16h-12a2 2 0 0 0 -2 2"/><path d="M9 8h6"/></g>`;
}

async function createIcon(size: number, maskable = false): Promise<Buffer> {
  const inset = maskable ? 44 : 30;
  const scale = (size - inset * 2) / 128;
  const category = `<path d="${ribbonPaths.category}" transform="translate(${inset} ${inset}) scale(${scale})" fill="${COLORS.ochre}"/>`;
  const bookSize = size * (maskable ? 0.25 : 0.3);
  return sharp(
    svg(
      `<rect width="100%" height="100%" fill="${COLORS.paper}"/>${category}${bookIcon((size - bookSize) / 2 + size * 0.04, (size - bookSize) / 2, bookSize)}`,
      size,
      size,
    ),
  )
    .png()
    .toBuffer();
}

async function createOgImage(): Promise<Buffer> {
  const [displayFont, dataFont] = await Promise.all([
    font("instrument-serif-italic.woff2"),
    font("ibm-plex-mono-latin.woff2"),
  ]);
  const stripeX = 126;
  const stripeY = 364;
  const stripeWidth = 948;
  const stripeHeight = 152;
  const ribbonWidth = 188;
  const ribbonX = stripeX + stripeWidth - ribbonWidth;
  const countX = ribbonX - 38;

  return sharp(
    svg(
      `<style>@font-face{font-family:Instrument;src:url(data:font/woff2;base64,${displayFont})}@font-face{font-family:Data;src:url(data:font/woff2;base64,${dataFont})}</style><rect width="1200" height="630" fill="${COLORS.paper}"/><rect x="28" y="28" width="1144" height="574" fill="none" stroke="${COLORS.hairline}" stroke-width="2"/><text x="126" y="190" fill="${COLORS.ink}" font-family="Instrument, Georgia, serif" font-size="79" font-style="italic">Mistria Field Guide</text><text x="130" y="245" fill="${COLORS.muted}" font-family="Data, monospace" font-size="20" letter-spacing="2.5">YOUR UNOFFICIAL COMPLETION COMPANION</text><rect x="${stripeX}" y="${stripeY}" width="${stripeWidth}" height="${stripeHeight}" fill="${COLORS.raised}"/><path d="M 0 0 H 100 V 100 H 0 L 16 50 Z" transform="translate(${ribbonX} ${stripeY + 8}) scale(${ribbonWidth / 100} ${(stripeHeight - 16) / 100})" fill="${COLORS.ochre}"/><text x="166" y="424" fill="${COLORS.ink}" font-family="Georgia, serif" font-size="42" font-weight="600">Everything</text><text x="166" y="470" fill="${COLORS.muted}" font-family="Georgia, serif" font-size="25">Track every collection, quest, skill, &amp; more.</text><text x="${countX}" y="430" fill="${COLORS.ink}" font-family="Data, monospace" font-size="25" text-anchor="end">${ogProgress.completed.toLocaleString()} <tspan fill="${COLORS.ochre}">/</tspan> ${ogProgress.total.toLocaleString()}</text><rect x="${stripeX}" y="510" width="${stripeWidth}" height="6" fill="#e4ddcf"/><rect x="${stripeX}" y="510" width="${(stripeWidth * ogProgress.percent) / 100}" height="6" fill="${COLORS.ochre}"/>`,
      1200,
      630,
    ),
  )
    .png()
    .toBuffer();
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
    npcLevels: {},
    npcRelationships: {},
    petCosmetics: new Set(),
    petSkins: new Set(),
    questStates: {},
    reachedSeason: "spring",
    renown: 0,
    skillLevels: {},
    unlockedPerks: new Set(),
  };
}

async function font(name: string): Promise<string> {
  const path = new URL(`../static/fonts/${name}`, import.meta.url);
  return (await readFile(path)).toString("base64");
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
    createIcon(512).then((image) => sharp(image).toFile(join(STATIC, "icon-512.png"))),
    createIcon(512, true).then((image) =>
      sharp(image).toFile(join(STATIC, "icon-maskable-512.png")),
    ),
    createOgImage().then((image) => sharp(image).toFile(join(STATIC, "og-image.png"))),
  ]);
  console.log(
    `Generated brand assets with ${ogProgress.total.toLocaleString()} total trackable entries.`,
  );
}

function svg(content: string, width: number, height: number): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${content}</svg>`,
  );
}

void main();
