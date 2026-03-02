import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
import { localize } from "./localize.js";
import { parseFiddle } from "./parse-fiddle.js";

import type { TrackerData } from "$lib/types/tracker-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_ROOT = resolve(__dirname, "..");
const INPUT_DIR = resolve(PIPELINE_ROOT, "input");
const OUTPUT_DIR = resolve(PIPELINE_ROOT, "output");
const APP_DATA_DIR = resolve(PIPELINE_ROOT, "..", "src", "lib", "data");
const OUTPUT_FILE = "tracker-data.json";

function main(): void {
  console.log("🌾 Harvest Helper — Data Pipeline\n");

  // Validate input
  const fiddlePath = resolve(INPUT_DIR, "__fiddle__.json");
  if (!existsSync(fiddlePath)) {
    console.error(`❌ Missing input: ${fiddlePath}`);
    console.error("   Drop __fiddle__.json into pipeline/input/");
    process.exit(1);
  }

  // Step 1: Parse
  console.log("Step 1: Parsing fiddle.json...");
  const fiddle = parseFiddle(INPUT_DIR);

  // Extract version
  const versionData = fiddle.version as Record<string, unknown> | undefined;
  const version = (versionData?.version as string | undefined) ?? "unknown";
  console.log(`  Game version: ${version}\n`);

  // Step 2: Localize
  console.log("Step 2: Resolving localization...");
  const localized = localize(fiddle, INPUT_DIR);
  console.log();

  // Step 3: Extract
  console.log("Step 3: Extracting tracker data...");
  const museum = extractMuseum(localized);
  const { almanac, items } = extractAlmanac(localized);
  const animals = extractAnimals(localized);
  const npcs = extractNpcs(localized);
  const cosmetics = extractCosmetics(localized);
  const skills = extractSkills(localized);
  const renown = extractRenown(localized);
  const quests = extractQuests(localized);
  const mines = extractMines(localized);
  const sources = extractSources(localized);
  const questGates = extractQuestGates(localized);

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

  // Sync package.json version with game version
  const packageJsonPath = resolve(PIPELINE_ROOT, "..", "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
    version?: string;
  };
  if (version !== "unknown" && packageJson.version !== version) {
    packageJson.version = version;
    writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
    console.log(`  Synced:  package.json version → ${version}`);
  }

  // Step 5: Human-readable outputs (for inspection, not shipped to app)
  console.log("\nStep 5: Writing human-readable outputs...");

  // Human-readable fiddle (nested, full data)
  const fiddlePretty = JSON.stringify(localized, null, 2);
  writeFileSync(resolve(OUTPUT_DIR, "fiddle-readable.json"), fiddlePretty);
  console.log(
    `  Written: pipeline/output/fiddle-readable.json (${(fiddlePretty.length / 1024 / 1024).toFixed(1)} MB)`,
  );

  // Human-readable tracker data (same as pretty but with sorted keys for diffing)
  writeFileSync(resolve(OUTPUT_DIR, "tracker-data-readable.json"), prettyJson);
  console.log(
    `  Written: pipeline/output/tracker-data-readable.json (${(prettyJson.length / 1024).toFixed(1)} KB)`,
  );

  console.log("\n✅ Pipeline complete!");
}

main();
