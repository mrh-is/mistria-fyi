import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateExpressions } from "./evaluate.js";
import { extractAlmanac } from "./extractors/almanac.js";
import { extractAnimals } from "./extractors/animals.js";
import { extractCosmetics } from "./extractors/cosmetics.js";
import { extractMines } from "./extractors/mines.js";
import { extractMuseum } from "./extractors/museum.js";
import { extractNpcs } from "./extractors/npcs.js";
import {
  applyAnimalQuestGates,
  applyItemQuestGates,
  applySpellQuestGates,
  extractQuestGates,
} from "./extractors/quest-gates.js";
import { extractQuests } from "./extractors/quests.js";
import { extractRenown } from "./extractors/renown.js";
import { extractSkills } from "./extractors/skills.js";
import { extractSources } from "./extractors/sources.js";
import { parseFiddle } from "./parse-fiddle.js";

import type { TrackerData } from "$lib/types/tracker-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(PIPELINE_ROOT, "output");
const APP_DATA_DIR = resolve(PIPELINE_ROOT, "..", "src", "lib", "data");
const OUTPUT_FILE = "tracker-data.json";

function main(): void {
  console.log("🌾 Harvest Helper — Data Pipeline\n");

  const args = process.argv.slice(2).filter((a) => a !== "--");
  const assetsDir = args.find((a) => !a.startsWith("-")) ?? process.env.MISTRIA_ASSETS;
  if (!assetsDir) {
    console.error("Usage: tsx src/main.ts <path-to-assets-dir>");
    console.error("  Or set MISTRIA_ASSETS environment variable");
    process.exit(1);
  }

  const fiddleDir = resolve(assetsDir, "fiddle");
  if (!existsSync(fiddleDir)) {
    console.error(`❌ Missing input: ${fiddleDir}`);
    console.error("   Pass the path to the assets directory containing fiddle/");
    process.exit(1);
  }

  // --parse-only: smoke test that stops after parsing
  const parseOnly = args.includes("--parse-only");

  // Step 1: Parse
  console.log("Step 1: Parsing TOML data...");
  const parsed = parseFiddle(assetsDir);
  const fiddle = parsed.data;

  // Extract version
  const misc = fiddle.misc as Record<string, unknown> | undefined;
  const version = (misc?.version as string | undefined) ?? "unknown";
  console.log(`  Game version: ${version}\n`);

  if (parseOnly) {
    if (parsed.fileCount !== 295) {
      console.error(`  ❌ Expected 295 files, got ${parsed.fileCount}`);
      process.exit(1);
    }
    const checks = ["items.other.cooked_dishes", "npcs.holt", "dungeons.dungeons.biomes"];
    for (const path of checks) {
      const parts = path.split(".");
      let current: unknown = fiddle;
      for (const part of parts) {
        current = (current as Record<string, unknown>)?.[part];
      }
      if (current === undefined) {
        console.error(`  ❌ Missing representative path: ${path}`);
        process.exit(1);
      }
    }
    console.log("  ✅ Parse-only smoke test passed");
    return;
  }

  // Step 2: Evaluate expressions
  console.log("Step 2: Evaluating expressions...");
  evaluateExpressions(fiddle);
  console.log();

  // Step 3: Extract
  console.log("Step 3: Extracting tracker data...");
  const museum = extractMuseum(fiddle);
  const { almanac, items } = extractAlmanac(fiddle);
  const animals = extractAnimals(fiddle);
  const npcs = extractNpcs(fiddle);
  const cosmetics = extractCosmetics(fiddle);
  const skills = extractSkills(fiddle);
  const renown = extractRenown(fiddle);
  const quests = extractQuests(fiddle);
  const mines = extractMines(fiddle);
  const sources = extractSources(fiddle);
  const questGates = extractQuestGates(fiddle);

  applyItemQuestGates(items, questGates.itemGates);
  applyAnimalQuestGates(animals, questGates.animalGates);
  applySpellQuestGates(mines, questGates.spellGates);
  console.log();

  // Step 4: Assemble
  console.log("Step 4: Assembling tracker-data.json...");
  const trackerData: TrackerData = {
    almanac,
    animals,
    cosmetics,
    generatedAt: new Date().toISOString(),
    items,
    mines,
    museum,
    npcs,
    questGates,
    quests,
    renown,
    skills,
    sources,
    version,
  };

  const json = JSON.stringify(trackerData);
  const prettyJson = JSON.stringify(trackerData, null, 2);

  // Write output
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(resolve(OUTPUT_DIR, OUTPUT_FILE), prettyJson);
  console.log(
    `  Written: pipeline/output/${OUTPUT_FILE} (${(prettyJson.length / 1024).toFixed(1)} KB pretty)`,
  );

  // Copy to app
  mkdirSync(APP_DATA_DIR, { recursive: true });
  writeFileSync(resolve(APP_DATA_DIR, OUTPUT_FILE), json);
  console.log(
    `  Copied:  src/lib/data/${OUTPUT_FILE} (${(json.length / 1024).toFixed(1)} KB minified)`,
  );

  // Step 5: Human-readable outputs (for inspection, not shipped to app)
  console.log("\nStep 5: Writing human-readable outputs...");

  const fiddlePretty = JSON.stringify(fiddle, null, 2);
  writeFileSync(resolve(OUTPUT_DIR, "fiddle-readable.json"), fiddlePretty);
  console.log(
    `  Written: pipeline/output/fiddle-readable.json (${(fiddlePretty.length / 1024 / 1024).toFixed(1)} MB)`,
  );

  writeFileSync(resolve(OUTPUT_DIR, "tracker-data-readable.json"), prettyJson);
  console.log(
    `  Written: pipeline/output/tracker-data-readable.json (${(prettyJson.length / 1024).toFixed(1)} KB)`,
  );

  console.log("\n✅ Pipeline complete!");
}

main();
