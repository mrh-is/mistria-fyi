# Portable pipeline tests implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every default test command pass without game assets while retaining an explicit,
failing-on-misconfiguration suite for canonical v1.0.2 asset checks.

**Architecture:** Normal `*.test.ts` files use temporary TOML trees or in-memory parsed data and are
the only files collected by the root Vitest configuration. Canonical checks live in
`*.assets.test.ts`, share one strict asset-path resolver, and run through a dedicated Vitest config
and package script. Issue #90 can then add credential-free CI without claiming to regenerate data.

**Tech stack:** TypeScript 6, Vitest 4, Node.js 26, pnpm, smol-toml, GitHub Actions issue metadata

**Spec:** `docs/superpowers/specs/2026-08-29-portable-pipeline-tests-design.md`

## Global constraints

- Use Node.js `>=26.0.0 <27.0.0` and pnpm exclusively.
- Do not commit, copy, encrypt, upload, cache, or publish files from `pipeline/input`.
- `pnpm run test` and `pnpm run test:pipeline` must not require `pipeline/input` or
  `MISTRIA_ASSETS`.
- `pnpm run test:pipeline:assets` must use `MISTRIA_ASSETS` or `pipeline/input/assets` and fail when
  the resolved directory lacks `fiddle/`.
- Preserve the canonical v1.0.2 count of 295 parsed files and representative-path assertions.
- Never hand-edit `src/lib/data/tracker-data.json`.
- Keep real-data expectations version-specific; do not weaken them to accommodate absent assets.
- Follow strict TypeScript, sorted type imports, Prettier formatting, & zero-warning ESLint.

---

### Task 1: Shared fixture & asset-path helpers

**Files:**

- Modify: `pipeline/src/test-helpers.ts`
- Create: `pipeline/src/test-helpers.test.ts`

**Interfaces:**

- Consumes: `ParsedGameData` from `pipeline/src/parse-fiddle.ts`.
- Produces: `createAssetsFixture(files: Record<string, string>): string`,
  `removeAssetsFixtures(): void`, & `requireGameAssetsDir(): string`.

- [ ] **Step 1: Write failing helper tests**

Add tests that create a temporary `fiddle/` tree, verify nested TOML contents, remove all registered
trees, resolve an explicit valid `MISTRIA_ASSETS`, & reject an explicit missing directory:

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAssetsFixture, removeAssetsFixtures, requireGameAssetsDir } from "./test-helpers.js";

afterEach(() => {
  removeAssetsFixtures();
  vi.unstubAllEnvs();
});

describe("asset test helpers", () => {
  it("creates and removes a temporary fiddle tree", () => {
    const assetsDir = createAssetsFixture({ "items/crops.toml": 'turnip = { name = "Turnip" }' });
    const fixtureFile = join(assetsDir, "fiddle/items/crops.toml");

    expect(readFileSync(fixtureFile, "utf8")).toContain("Turnip");

    removeAssetsFixtures();
    expect(existsSync(assetsDir)).toBe(false);
  });

  it("requires the resolved game-assets fiddle directory", () => {
    const assetsDir = createAssetsFixture({ "misc.toml": 'version = "1.0.2"' });
    vi.stubEnv("MISTRIA_ASSETS", assetsDir);

    expect(requireGameAssetsDir()).toBe(assetsDir);
  });

  it("reports a missing resolved game-assets directory", () => {
    vi.stubEnv("MISTRIA_ASSETS", "/definitely/missing/mistria-assets");

    expect(() => requireGameAssetsDir()).toThrow(
      "Game assets not found at /definitely/missing/mistria-assets/fiddle",
    );
  });
});
```

- [ ] **Step 2: Run the helper test and verify red**

Run: `rtk pnpm exec vitest run pipeline/src/test-helpers.test.ts`

Expected: FAIL because the three named helper exports do not exist.

- [ ] **Step 3: Implement the helpers**

Extend `pipeline/src/test-helpers.ts` without changing `makeFiddle`:

```typescript
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryAssetsDirectories: string[] = [];

export function createAssetsFixture(files: Record<string, string>): string {
  const assetsDir = mkdtempSync(join(tmpdir(), "harvest-helper-assets-"));
  temporaryAssetsDirectories.push(assetsDir);

  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = join(assetsDir, "fiddle", relativePath);
    mkdirSync(join(filePath, ".."), { recursive: true });
    writeFileSync(filePath, contents);
  }

  return assetsDir;
}

export function removeAssetsFixtures(): void {
  for (const directory of temporaryAssetsDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
}

export function requireGameAssetsDir(): string {
  const assetsDir = process.env.MISTRIA_ASSETS ?? "pipeline/input/assets";
  const fiddleDir = join(assetsDir, "fiddle");
  if (!existsSync(fiddleDir)) {
    throw new Error(
      `Game assets not found at ${fiddleDir}. Set MISTRIA_ASSETS to the assets directory.`,
    );
  }
  return assetsDir;
}
```

- [ ] **Step 4: Run the helper tests and pipeline type check**

Run: `rtk pnpm exec vitest run pipeline/src/test-helpers.test.ts`

Expected: three tests PASS.

Run: `rtk pnpm run check:pipeline`

Expected: exit 0 with no TypeScript errors.

- [ ] **Step 5: Commit the shared helpers**

```bash
rtk git add pipeline/src/test-helpers.ts pipeline/src/test-helpers.test.ts
rtk git commit -m "test: add portable pipeline fixture helpers"
```

### Task 2: Explicit asset-suite boundary

**Files:**

- Modify: `vite.config.ts`
- Create: `vitest.assets.config.ts`
- Modify: `package.json`
- Create: `pipeline/src/parse-fiddle.assets.test.ts`
- Modify: `pipeline/src/parse-fiddle.test.ts`

**Interfaces:**

- Consumes: `createAssetsFixture`, `removeAssetsFixtures`, & `requireGameAssetsDir` from Task 1.
- Produces: the `*.assets.test.ts` filename contract and `pnpm run test:pipeline:assets`.

- [ ] **Step 1: Prove the current parser test depends on local assets**

Temporarily point the test at a missing path by hiding the worktree symlink, run the parser test, &
restore the symlink immediately:

```bash
rtk mv pipeline/input pipeline/input.available
rtk pnpm exec vitest run pipeline/src/parse-fiddle.test.ts
rtk mv pipeline/input.available pipeline/input
```

Expected: FAIL in “parses the complete v1.0.2 fixture with representative paths” because
`pipeline/input/assets/fiddle` is absent. If the test command is interrupted, restore the symlink
before continuing.

- [ ] **Step 2: Add a synthetic parser happy path**

Replace the canonical-fixture test in `parse-fiddle.test.ts` with a two-file temporary fixture. Use
`afterEach(removeAssetsFixtures)` and assert file count, nested data, provenance, metadata
exclusion, & nearest-ancestor provenance:

```typescript
it("assembles nested TOML files and records source provenance", () => {
  const assetsDir = createAssetsFixture({
    "items/other/cooked_dishes.meta.toml": "ignored = true",
    "items/other/cooked_dishes.toml":
      'turnip_soup = { name = "Turnip Soup", value = { bin = 100 } }',
    "npcs/holt.toml": 'name = "Holt"',
  });

  const parsed = parseFiddle(assetsDir);

  expect(parsed.fileCount).toBe(2);
  expect(parsed.data).toHaveProperty("items.other.cooked_dishes.turnip_soup");
  expect(parsed.data).toHaveProperty("npcs.holt.name", "Holt");
  expect(parsed.sourceFileByRootPath.get("items.other.cooked_dishes")).toBe(
    "items/other/cooked_dishes.toml",
  );
  expect(sourceFileFor(parsed.data, "items.other.cooked_dishes.turnip_soup.value.bin")).toBe(
    "items/other/cooked_dishes.toml",
  );
});
```

Replace the file-local fixture creator and cleanup array with Task 1’s shared helpers.

- [ ] **Step 3: Preserve the canonical parser assertion in an asset test**

Create `parse-fiddle.assets.test.ts`:

```typescript
import { describe, expect, it } from "vitest";

import { parseFiddle, sourceFileFor } from "./parse-fiddle.js";
import { requireGameAssetsDir } from "./test-helpers.js";

describe("parseFiddle — v1.0.2 assets", () => {
  it("parses all files with representative paths", () => {
    const parsed = parseFiddle(requireGameAssetsDir());

    expect(parsed.fileCount).toBe(295);
    expect(parsed.data).toHaveProperty("items.other.cooked_dishes");
    expect(parsed.data).toHaveProperty("npcs.holt");
    expect(parsed.data).toHaveProperty("dungeons.dungeons.biomes");
    expect(parsed.sourceFileByRootPath.get("items.other.cooked_dishes")).toBe(
      "items/other/cooked_dishes.toml",
    );
    expect(sourceFileFor(parsed.data, "items.other.cooked_dishes.turnip_soup.value.bin")).toBe(
      "items/other/cooked_dishes.toml",
    );
  });
});
```

- [ ] **Step 4: Configure default exclusion and the dedicated suite**

Add `"**/*.assets.test.ts"` to `vite.config.ts`’s test exclusions. Create a standalone
`vitest.assets.config.ts` that installs the SvelteKit alias plugin without inheriting the root
exclusion:

```typescript
import { sveltekit } from "@sveltejs/kit/vite";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    exclude: [...configDefaults.exclude, "**/.worktrees/**", "**/.claude/worktrees/**"],
    include: ["pipeline/**/*.assets.test.ts"],
  },
});
```

Add the root package script:

```json
"test:pipeline:assets": "vitest run --config vitest.assets.config.ts"
```

- [ ] **Step 5: Verify both collection boundaries**

Run: `rtk pnpm exec vitest run pipeline/src/parse-fiddle.test.ts`

Expected: the synthetic parser tests PASS without reading the canonical fixture.

Run: `MISTRIA_ASSETS=/definitely/missing rtk pnpm run test:pipeline:assets`

Expected: FAIL with “Game assets not found at /definitely/missing/fiddle”.

Run: `rtk pnpm run test:pipeline:assets`

Expected: the v1.0.2 parser asset test PASS.

- [ ] **Step 6: Commit the parser split and suite configuration**

```bash
rtk git add package.json vite.config.ts vitest.assets.config.ts \
  pipeline/src/parse-fiddle.test.ts pipeline/src/parse-fiddle.assets.test.ts
rtk git commit -m "test: separate canonical pipeline asset checks"
```

### Task 3: Portable evaluator & requirements coverage

**Files:**

- Modify: `pipeline/src/evaluate.test.ts`
- Create: `pipeline/src/evaluate.assets.test.ts`
- Modify: `pipeline/src/requirements.test.ts`
- Create: `pipeline/src/requirements.assets.test.ts`

**Interfaces:**

- Consumes: `makeFiddle` & `requireGameAssetsDir` from Task 1 and the asset-suite filename contract
  from Task 2.
- Produces: focused default evaluator and requirement tests plus fixture-wide asset checks.

- [ ] **Step 1: Write focused evaluator expectations before removing real-data reads**

Build parsed item trees with `makeFiddle`. Add direct assertions for referenced store
multiplication, recipe cost multiplication, ingredient counts, & complete supported-expression
resolution:

```typescript
it("resolves referenced store and recipe-cost expressions", () => {
  const fiddle = makeFiddle({
    items: {
      other: {
        values: {
          basic_wood: { value: { bin: 4, store: 10 } },
          bundle: { value: { store: "basic_wood.store * 3" } },
          crafted: {
            recipe: [{ count: 2, item: "basic_wood" }],
            value: { bin: "self.recipe * 1.5" },
          },
        },
      },
    },
  });

  evaluateExpressions(fiddle);

  const items = (
    fiddle.items as Record<string, Record<string, Record<string, Record<string, unknown>>>>
  ).other.values;
  expect((items.bundle.value as Record<string, unknown>).store).toBe(30);
  expect((items.crafted.value as Record<string, unknown>).bin).toBe(12);
});
```

Retain or strengthen existing error tests in the file. Delete weak assertions that conditionally
pass when an item is absent.

- [ ] **Step 2: Run the evaluator test while the old real-data cases remain**

Run: `MISTRIA_ASSETS=/definitely/missing rtk pnpm exec vitest run pipeline/src/evaluate.test.ts`

Expected: the new focused test passes, while existing hard-coded `pipeline/input/assets` cases still
demonstrate the portability failure when the worktree link is hidden during Task 2’s verification.

- [ ] **Step 3: Move fixture-wide evaluator coverage**

Create `evaluate.assets.test.ts` with one canonical test:

```typescript
it("resolves every supported value expression in the canonical fixture", () => {
  const parsed = parseFiddle(requireGameAssetsDir());

  expect(() => evaluateExpressions(parsed.data)).not.toThrow();

  // Traverse every emitted item value and assert that bin and store are not strings.
});
```

Remove all `parseFiddle("pipeline/input/assets")` calls from `evaluate.test.ts`; every retained
normal test must construct only the data it needs.

- [ ] **Step 4: Move the real requirement-registry assertion**

Create `requirements.assets.test.ts` by moving “parses the full requirements.toml fixture”. Resolve
the data through `parseFiddle(requireGameAssetsDir())` and preserve the existing size thresholds
plus the `repaired_general_store` expectation.

Keep `requirements.test.ts`’s synthetic `buildRequirementDefinitions` and named-resolution tests.
They already establish the relevant behavior without asset access.

- [ ] **Step 5: Verify focused and canonical tiers**

Run: `rtk pnpm exec vitest run pipeline/src/evaluate.test.ts pipeline/src/requirements.test.ts`

Expected: all focused tests PASS.

Run: `rtk pnpm run test:pipeline:assets`

Expected: parser, evaluator, & requirements asset files PASS.

- [ ] **Step 6: Commit evaluator and requirement portability**

```bash
rtk git add pipeline/src/evaluate.test.ts pipeline/src/evaluate.assets.test.ts \
  pipeline/src/requirements.test.ts pipeline/src/requirements.assets.test.ts
rtk git commit -m "test: replace pipeline asset dependencies with focused fixtures"
```

### Task 4: Move recipe integration coverage

**Files:**

- Modify: `pipeline/src/extractors/recipes.test.ts`
- Create: `pipeline/src/extractors/recipes.assets.test.ts`

**Interfaces:**

- Consumes: `requireGameAssetsDir` and the `*.assets.test.ts` suite contract.
- Produces: an asset-only recipe scale and source-family integration test; normal recipe tests no
  longer inspect filesystem availability.

- [ ] **Step 1: Capture the existing real-data expectations unchanged**

Move the current “extractRecipes — real data” test into `recipes.assets.test.ts`. Replace its
`existsSync`, `HAS_ASSETS`, & `describe.skipIf` setup with:

```typescript
const ASSETS_DIR = requireGameAssetsDir();

describe("extractRecipes — v1.0.2 assets", () => {
  it("produces recipes with expected source type counts", () => {
    const { data: fiddle } = parseFiddle(ASSETS_DIR);
    evaluateExpressions(fiddle);
    // Preserve every existing count threshold, reference check, and name check.
  });
});
```

- [ ] **Step 2: Remove filesystem coupling from the normal recipe test**

Delete the `node:fs` import, real-data constants, and skipped describe block from `recipes.test.ts`.
Do not alter its synthetic extractor tests.

- [ ] **Step 3: Verify normal and asset recipe tests**

Run: `rtk pnpm exec vitest run pipeline/src/extractors/recipes.test.ts`

Expected: normal recipe tests PASS and contain no skipped real-data block.

Run: `rtk pnpm run test:pipeline:assets`

Expected: all four asset files PASS, including recipe scale and source-family assertions.

- [ ] **Step 4: Commit the recipe integration split**

```bash
rtk git add pipeline/src/extractors/recipes.test.ts pipeline/src/extractors/recipes.assets.test.ts
rtk git commit -m "test: make recipe asset integration explicit"
```

### Task 5: Documentation & fresh-clone proof

**Files:**

- Modify: `pipeline/README.md`
- Modify: `docs/development-workflow.md`

**Interfaces:**

- Consumes: verified commands from Tasks 2 through 4.
- Produces: contributor guidance used by issue #90 and the project verification workflow.

- [ ] **Step 1: Replace the obsolete portability recommendation**

Update `pipeline/README.md` to describe the delivered two-tier behavior instead of calling portable
tests a recommendation. Include these commands and meanings:

```bash
rtk pnpm run test:pipeline
rtk pnpm run test:pipeline:assets
MISTRIA_ASSETS=/path/to/assets rtk pnpm run test:pipeline:assets
```

State that the default command is required in public CI, the asset command is local and strict, &
regeneration remains a separate `pnpm run pipeline -- <path>` operation.

- [ ] **Step 2: Clarify the verification matrix**

Update `docs/development-workflow.md` so `pnpm run test` is explicitly fresh-clone-safe. Add a local
real-data subsection requiring the asset suite and regeneration after pipeline extractor, parser,
evaluator, or shared data-contract changes.

- [ ] **Step 3: Prove no normal test names the private fixture**

Run:

```bash
rtk rg -n 'pipeline/input/assets|MISTRIA_ASSETS|requireGameAssetsDir' pipeline/src \
  --glob '*.test.ts' --glob '!*.assets.test.ts'
```

Expected: no output.

- [ ] **Step 4: Prove default tests without the worktree asset link**

Move only the worktree’s `pipeline/input` symlink aside, run both default commands, & restore it:

```bash
rtk mv pipeline/input pipeline/input.available
rtk pnpm run test:pipeline
rtk pnpm run test
rtk mv pipeline/input.available pipeline/input
```

Expected: both commands PASS. Restore the symlink before any subsequent step, including after a
failure or interruption.

- [ ] **Step 5: Prove strict asset-suite failure and success**

Run: `MISTRIA_ASSETS=/definitely/missing rtk pnpm run test:pipeline:assets`

Expected: nonzero exit with the resolved missing `fiddle/` path.

Run: `rtk pnpm run test:pipeline:assets`

Expected: all canonical v1.0.2 asset tests PASS.

- [ ] **Step 6: Commit documentation**

```bash
rtk git add pipeline/README.md docs/development-workflow.md
rtk git commit -m "docs: distinguish portable and asset-backed pipeline tests"
```

### Task 6: Final verification, issue alignment, & delivery

**Files:**

- Verify: all changed repository files
- Update externally: GitHub issues #128 and #90
- Create externally: pull request for branch `128-portable-pipeline-tests`

**Interfaces:**

- Consumes: every prior task’s committed changes.
- Produces: verified issue metadata and a PR that closes #128 and leaves #90 ready for CI work.

- [ ] **Step 1: Run the complete verification matrix**

Run each command directly and require exit 0:

```bash
rtk pnpm run lint:fix
rtk pnpm run lint
rtk pnpm run check
rtk pnpm run test
rtk pnpm run test:pipeline:assets
rtk pnpm run build
```

The pipeline regeneration command is intentionally excluded because no parser, evaluator, extractor,
shared data contract, or generated output behavior changes. The strict canonical asset suite
supplies the applicable real-data verification without rewriting `generatedAt`.

- [ ] **Step 2: Review the complete branch diff**

Run:

```bash
rtk git status --short
rtk git diff main...HEAD --stat
rtk git diff main...HEAD
rtk git log --oneline main..HEAD
```

Expected: only the approved spec, plan, test/configuration changes, & documentation are present; no
asset files or unrelated generated changes are tracked.

- [ ] **Step 3: Commit final mechanical corrections if needed**

If `lint:fix` changed tracked files, stage only those task-owned paths and commit:

```bash
rtk git add package.json vite.config.ts vitest.assets.config.ts pipeline/src pipeline/README.md \
  docs/development-workflow.md
rtk git commit -m "chore: finalize portable pipeline verification"
```

If no tracked files changed, do not create an empty commit.

- [ ] **Step 4: Update issue #128**

Change its title to “Make pipeline tests portable without game assets”. Replace the body with a
summary of the two-tier test boundary, the acceptance commands, the explicit non-goal of remote
asset provisioning, & the fact that #128 unblocks #90. Preserve the PR as the closing mechanism.

- [ ] **Step 5: Align issue #90**

Edit #90 to state that it depends on #128, that `pnpm run test` is fresh-clone-safe after #128, and
that CI excludes both `pnpm run pipeline` and `pnpm run test:pipeline:assets`. Remove the obsolete
investigation into uploading assets as secrets or artifacts.

- [ ] **Step 6: Push and open the pull request**

```bash
rtk git push -u origin 128-portable-pipeline-tests
rtk gh pr create --title "Make pipeline tests portable without game assets" --body "Closes #128"
```

Expand the PR body with the default/asset test boundary, issue #90 interaction, verification
results, & the explicit absence of hosted game assets.
