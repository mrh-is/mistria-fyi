# Takedown procedure

tl;dr: if NPC Studio or another rights holder asks for removal, acknowledge the request, then run
the section below that matches its scope. Each section takes under an hour. The posture behind this
is recorded in [the launch posture decision](decisions/2026-10-07-public-launch-posture.md).

## Before any takedown

1. **Acknowledge** from `michael@mistria.fyi` within a day, naming what will be removed & when.
2. **Scope the request.** Map it to one or more components: sprites, dataset, pipeline, the farm
   planner pack (once it exists), or the whole repository. When the scope is unclear, ask, but take
   down the named material first.
3. **Record it.** Open a private-archive issue (or a local note when the request is confidential)
   with the request date, the scope, & the steps taken. Don’t quote the request publicly without
   permission.

## Sprites

Sprites live under the `sprites/` prefix of the `mistria-fyi-assets` R2 bucket, served at
`assets.mistria.fyi`. The same bucket serves `fonts/`, so **never delete the bucket or detach its
custom domain**; remove only `sprites/`. Every sprite slot renders a placeholder when its image
fails to load, so the site keeps working.

1. **Block at the edge first (optional, stops new downloads only).** In the Cloudflare dashboard for
   `mistria.fyi`, add a WAF custom rule: hostname equals `assets.mistria.fyi` and URI path starts
   with `/sprites/`, action "Block". This takes effect within seconds and bypasses the edge cache. A
   WAF block response carries no `Access-Control-Allow-Origin` header, so the service worker’s
   cross-origin revalidation can’t read it (the fetch rejects, and the worker keeps its cached
   copy). The block alone therefore doesn’t revoke installed clients; step 2 does.
2. **Delete the objects.** In the R2 dashboard, open `mistria-fyi-assets`, filter by the `sprites/`
   prefix, select all, & delete. With the sprites staged locally, this loop works too:

   ```bash
   find pipeline/output/sprites -name '*.webp' | sed 's|^pipeline/output/||' | while read -r key; do pnpm exec wrangler r2 object delete "mistria-fyi-assets/$key" --remote; done
   ```

3. **Purge the cache,** then **remove the WAF rule from step 1** so R2 answers. Caching →
   Configuration → Custom purge, by prefix `assets.mistria.fyi/sprites/`. The supported withdrawal
   path is a deleted object: R2 answers its 404 with the bucket’s CORS headers, which the service
   worker can read & act on. Keep a block rule only if it adds `Access-Control-Allow-Origin: *` to
   its response.
4. **Stop future uploads.** Remove the `sprites:upload` script (or make it refuse to run), so a
   routine game update doesn’t restore them.
5. **Verify.**
   `curl -si -H 'Origin: https://mistria.fyi' https://assets.mistria.fyi/sprites/items/<any-id>.webp`
   returns 403 or 404 _with_ an `access-control-allow-origin` header (without it, installed clients
   keep their copies), and a fresh browser profile shows placeholders.

Note: returning visitors lose the sprites on their own within about a day. Sprites are uploaded with
`Cache-Control: public, max-age=86400, stale-while-revalidate=86400`. The service worker serves a
cached sprite at once & revalidates it in the background when the cached copy is a day old, evicting
the entry on a readable 403, 404, or 410. An installed PWA therefore drops a withdrawn sprite on the
load after the copy turns a day old (so within two days at worst); a browser tab may show a cached
sprite once more after a day, then the placeholder. Objects uploaded before this policy existed
carry the old one-year immutable header until re-uploaded (`FORCE=1 pnpm run sprites:upload`, a
launch step); against those, a plain browser tab is only guaranteed clean in a fresh profile.

## Dataset

`src/lib/data/tracker-data.json` is bundled into every build; the site can’t run without it, so
removing the dataset means taking the site down.

1. **Take the site offline.** In Cloudflare Pages, pause automatic deployments, then roll back
   production to a deployment that serves only a static notice, or remove the `mistria.fyi` custom
   domain from the Pages project. Delete old preview deployments too, since each `*.pages.dev` URL
   keeps serving its build.
2. **Remove it from the repository.** Delete the file on `main` and add it to `.gitignore`. Past
   commits still contain it, so continue with [Whole repository](#whole-repository) unless the
   request covers only the live site.

## Pipeline

1. **Delete `pipeline/` on `main`,** along with its scripts in `package.json`, its CI steps, and
   `docs/game-asset-format.md`. Commit with a neutral message (“Remove extraction pipeline”).
2. **Decide on history.** Past commits still contain the pipeline. If the request covers history,
   continue with [Whole repository](#whole-repository); otherwise this is complete.

## Farm planner pack

The farm planner (public #4) is planned, not built. When it ships, its geometry lives in one lazy
pack, loaded only when the planner opens, so it can be withdrawn without touching the dataset or the
sprites. [The decision record](decisions/2026-10-20-farm-planner-geometry.md) states what the pack
may contain: a coarse functional grid only, never full-resolution tile shapes, game sprites in
place, or anything that renders back into a recognizable layout. Check any request against that line
first; material beyond it is a map & comes out regardless.

This section is a template for the steps. Fill in the concrete paths when the pack is designed, &
keep these properties true so the steps stay short:

1. **Remove the pack from the build.** Delete the pack’s generated files, its generation step, & the
   lazy import that loads it, then redeploy. The pack is outside `tracker-data.json` & the service
   worker’s install-time precache, so nothing else changes.
2. **Make the planner cope without it.** The planner must degrade to a plain message or be removed
   with the pack; confirm that in a fresh browser profile.
3. **Purge installed copies.** Bump the app version so installed clients drop the cached pack (the
   worker evicts runtime-cached entries it can no longer fetch), & purge the cache for the pack’s
   URL prefix in Cloudflare.
4. **Check history.** If a pack was ever committed, past commits still contain it; continue with
   [Whole repository](#whole-repository) if the request covers history.
5. **Verify** that a fresh profile & an installed app both load the rest of the site, & that the
   pack’s URL returns 404.

## Whole repository

1. **Make it private:**
   `gh repo edit mrh-is/<repository> --visibility private --accept-visibility-change-consequences`.
   This removes public access to the code, history, issues, & pull requests at once. Public forks
   detach and stay public; GitHub doesn’t remove them.
2. **List forks** before step 1 with
   `gh api repos/mrh-is/<repository>/forks --paginate --jq '.[].full_name'`, so you can tell the
   requester which copies exist. Takedowns of third-party forks go through GitHub’s DMCA process and
   are the rights holder’s to file.
3. **If a public repository should remain**, build a new clean one. Never rewrite the public
   repository in place; its `refs/pull/*` keep the old blobs reachable.
   1. Install `git-filter-repo` (`brew install git-filter-repo`, or see its README), and make a
      fresh clone of the repository to filter.
   2. Run it once, with one `--path` per requested path (a directory ends in `/`); a second run
      refuses to proceed without `--force`:
      `git filter-repo --invert-paths --path static/sprites/ --path src/lib/data/tracker-data.json`.
   3. Verify the removal: `git log --all -- <requested-path>` prints nothing for each path. Then
      search the kept files for references to the removed material (imports, docs, build config,
      notices) & fix them by hand; filter-repo rewrites history, not the surviving text.
   4. `git filter-repo` drops the `origin` remote. Create the new repository, add it
      (`git remote add origin <new-repository-url>`), & push (`git push --all origin`, then
      `git push --tags origin`).
   5. The reference rewriting & secret scan that built the original public repository were deleted
      after the cutover. Commit `e4dd053a` still has them. List the whole directory with
      `git ls-tree -r e4dd053a scripts/public-repo` (`build-candidate.sh` depends on `gitleaks.toml`
      & `rewrite-references.py`), & extract it with
      `git archive e4dd053a scripts/public-repo | tar -x -C <empty-directory>`.

## Afterward

- Reply to the requester confirming what was removed, plus any limits (forks).
- Update `DISCLAIMER.md` & the About page if the project no longer distributes that material.
- Add a “Revisit” note to the launch posture decision record.
