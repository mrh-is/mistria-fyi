# Takedown procedure

tl;dr: if NPC Studio or another rights holder asks for removal, acknowledge the request, then run
the section below that matches its scope. Each section takes under an hour. The posture behind this
is recorded in [the launch posture decision](decisions/2026-10-07-public-launch-posture.md).

## Before any takedown

1. **Acknowledge** from `michael@mistria.fyi` within a day, naming what will be removed & when.
2. **Scope the request.** Map it to one or more components: sprites, dataset, pipeline, or the whole
   repository. When the scope is unclear, ask, but take down the named material first.
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

## Whole repository

1. **Make it private:**
   `gh repo edit mrh-is/<repository> --visibility private --accept-visibility-change-consequences`.
   This removes public access to the code, history, issues, & pull requests at once. Public forks
   detach and stay public; GitHub doesn’t remove them.
2. **List forks** before step 1 with
   `gh api repos/mrh-is/<repository>/forks --paginate --jq '.[].full_name'`, so you can tell the
   requester which copies exist. Takedowns of third-party forks go through GitHub’s DMCA process and
   are the rights holder’s to file.
3. **If a public repository should remain**, build a new clean one from a fresh clone: run
   `git filter-repo --invert-paths --path <requested-path>` for each path to remove, then verify the
   result (`git log --all -- <requested-path>` prints nothing) before publishing it as a new
   repository. Never rewrite the public repository in place; its `refs/pull/*` keep the old blobs
   reachable. The candidate builder that created the original public repository, with its reference
   rewriting & secret scan, was deleted after the cutover; commit `4edfb14f` is the last one that
   still has it (`git show 4edfb14f:scripts/public-repo/build-candidate.sh`).

## Afterward

- Reply to the requester confirming what was removed, plus any limits (forks).
- Update `DISCLAIMER.md` & the About page if the project no longer distributes that material.
- Add a “Revisit” note to the launch posture decision record.
