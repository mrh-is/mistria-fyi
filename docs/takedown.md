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

1. **Block at the edge first.** In the Cloudflare dashboard for `mistria.fyi`, add a WAF custom
   rule: hostname equals `assets.mistria.fyi` and URI path starts with `/sprites/`, action "Block".
   This takes effect within seconds and bypasses the edge cache.
2. **Delete the objects.** In the R2 dashboard, open `mistria-fyi-assets`, filter by the `sprites/`
   prefix, select all, & delete. With the sprites staged locally, this loop works too:

   ```bash
   find pipeline/output/sprites -name '*.webp' | sed 's|^pipeline/output/||' | while read -r key; do pnpx --allow-build=esbuild --allow-build=workerd wrangler r2 object delete "mistria-fyi-assets/$key" --remote; done
   ```

3. **Purge the cache.** Caching → Configuration → Custom purge, by prefix
   `assets.mistria.fyi/sprites/`.
4. **Stop future uploads.** Remove the `sprites:upload` script (or make it refuse to run), so a
   routine game update doesn’t restore them.
5. **Verify.** `curl -I https://assets.mistria.fyi/sprites/items/<any-id>.webp` returns 403 or 404,
   and a fresh browser profile shows placeholders.

Note: browsers & installed PWAs that already fetched a sprite keep it until their cache expires.
Sprites are uploaded with a one-year immutable `Cache-Control`, and the service worker’s sprite
cache doesn’t revalidate. Until that’s fixed (see #676), tell the requester plainly that existing
visitors’ local caches can’t be cleared remotely.

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

1. **Delete `pipeline/` on `main`,** along with its scripts in `package.json` and its CI steps.
   Commit with a neutral message (“Remove extraction pipeline”).
2. **Decide on history.** Past commits still contain the pipeline. If the request covers history,
   continue with [Whole repository](#whole-repository); otherwise this is complete.

## Whole repository

1. **Make it private:**
   `gh repo edit mrh-is/<public-repo> --visibility private --accept-visibility-change-consequences`.
   This removes public access to the code, history, issues, & pull requests at once. Public forks
   detach and stay public; GitHub doesn’t remove them.
2. **List forks** before step 1 with
   `gh api repos/mrh-is/<public-repo>/forks --paginate --jq '.[].full_name'`, so you can tell the
   requester which copies exist. Takedowns of third-party forks go through GitHub’s DMCA process and
   are the rights holder’s to file.
3. **If a public repository should remain**, build a new clean one with `git filter-repo`, removing
   the requested paths, the same way the public repository was created. Never rewrite the public
   repository in place; its `refs/pull/*` keep the old blobs reachable.

## Afterward

- Reply to the requester confirming what was removed, plus any limits (cached sprites, forks).
- Update `DISCLAIMER.md` & the About page if the project no longer distributes that material.
- Add a “Revisit” note to the launch posture decision record.
