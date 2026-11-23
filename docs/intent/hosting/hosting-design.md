---
parent: high-level-design
prefix: HOST
---

# Hosting

## Context and Design Philosophy

Slingshot is a static site: an `index.html`, a stylesheet, and JavaScript ES modules, with no build step. Hosting serves those files over HTTPS at two addresses: **production** at `slingshot.andreizimin.com`, and **dev** at `slingshot-dev.andreizimin.com`, where every change is checked on a real phone and laptop before it reaches players.

Nobody deploys by hand. A pipeline tests every push, deploys branches to dev and `main` to production, and then checks the live site against the commit it deployed. The requester's check on dev is the only manual step between a change and production.

The parent domain `andreizimin.com` is already served from AWS (Route 53 hosted zone, CloudFront), so both subdomains live in the same account and zone.

## Repository Layout

```
site/                       # everything that gets served; nothing else is uploaded
  index.html
  style.css
  sim/                      # flight-sim modules (no DOM)
  cockpit/                  # cockpit modules
tests/                      # node --test suites
deploy/hosting.mjs          # which stage gets which domain (pure, tested)
scripts/live-check.mjs      # the live-site check
bin/coherence-check.mjs     # the LID coherence check (see the `lid` node)
.github/workflows/ci.yml    # the pipeline
docs/
sst.config.ts
package.json                # "type": "module"
```

Keeping the served files in `site/` means docs, tests, scripts and `node_modules` are never uploaded.

## Stages and Domains

Infrastructure is defined with SST v3 (`sst.config.ts`):

- One `sst.aws.StaticSite` named `Slingshot`, `path: "site"`, no build command, in AWS region `us-east-1`.
- The domain comes from `domainFor(stage)` in `deploy/hosting.mjs`: `production` → `slingshot.andreizimin.com`, `dev` → `slingshot-dev.andreizimin.com`, any other stage → none (a throwaway CloudFront URL). SST finds the existing `andreizimin.com` Route 53 zone, issues the ACM certificate and creates the alias record.
- `removal: "retain"` on `production`, `"remove"` on every other stage.
- Every uploaded file is served with `Cache-Control: no-cache`, so browsers revalidate on each load and never mix a new `index.html` with old modules. The files are small enough that revalidation costs nothing noticeable.
- A deploy waits for its CloudFront invalidation to finish, so when the deploy step ends the site already serves the new files.

SST is pinned as a dev dependency (`sst@^3.17`). Before a stage's first deploy, Route 53 is checked for an existing record at its domain and for a wildcard alias on the parent's distribution; a conflict is resolved with the developer before deploying.

Dev and production are different browser origins, so they never share cached files or stored data.

## The Dev Stage

The same files are served on every stage, so the page works out where it is at runtime. `stageForHost(hostname)` in `site/cockpit/stage.js` maps the production hostname to `production`, the dev hostname to `dev`, `localhost` and private network addresses to `local`, and anything else to `preview`.

On every stage except production, the page:

- shows a small **DEV** badge, so dev is never mistaken for the live game;
- adds `<meta name="robots" content="noindex">`, so search engines that render pages do not list it.

The shared feedback widget already labels submissions from a hostname containing `-dev.` as `Env: dev`, and Umami reports dev under its own hostname, so neither needs a change.

## Deploy Pipeline

`.github/workflows/ci.yml` runs on every push:

1. **Test.** `npm ci`, `npm test`, and the coherence check (`npm run coherence`). Pull requests from forks get this job only.
2. **Deploy.** If the tests pass, the push deploys with `sst deploy --stage <stage>`: `main` to `production`, any other branch to `dev`.
3. **Live-site check.** `scripts/live-check.mjs` fetches every file under `site/` from the deployed address and fails the run unless each one answers 200, is served `no-cache`, matches the committed file byte for byte, and (for `.js`) has a JavaScript content type; the page must also carry the Umami and feedback tags. It retries for up to three minutes while a new deploy propagates.

Deploys to the same stage never overlap: a later push waits for the running deploy.

**Credentials.** The deploy job runs in a GitHub environment named after its stage (`dev` for any branch, `production` for `main` only). AWS trusts GitHub's OIDC tokens for exactly those two environments of this repository through the role `gha-deploy-slingshot`, so there are no long-lived keys. The role's ARN is a repository secret, and the AWS account ID is masked in logs, because the repository and its run logs are public.

**Dev shows the last branch pushed.** One change order at a time keeps that unambiguous; the pipeline reports which commit it deployed.

## Local Preview and Fallback

`npm run dev` runs `npx -y serve@14 site -l 5173`, serving `site/` at `http://localhost:5173` with a pinned zero-config static server. ES modules do not load from `file://` URLs, so opening `index.html` directly is not supported. Local preview is for the developer's own quick look; the requester's check happens on dev.

If GitHub Actions is unavailable, `npm run deploy:dev` and `npm run deploy:prod` run the tests and then deploy that stage from the laptop with the developer's AWS credentials. `deploy:prod` is run from `main` only.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Host | AWS S3 + CloudFront via SST `StaticSite` | Cloudflare, Vercel, GitHub Pages; hand-made S3 bucket | The parent domain's DNS and certificates are in AWS. SST handles the certificate, DNS and invalidation in one resource, as the developer's other sites do. |
| Served folder | `site/` only | Repository root | Nothing but game files is uploaded. |
| Where deploys run | GitHub Actions, on push | The developer's laptop | A deploy that depends on one machine and one person's memory gets skipped or done out of order. The pipeline makes "tested, on dev, checked live" the only path. |
| Production trigger | Merging into `main` | A manual "approve deployment" button | The requester already gave their go by checking dev; a second button would be a second manual step. |
| Telling dev apart | At runtime, from the hostname | A build step that bakes the stage in | The site has no build. A hostname check keeps the deployed files identical on every stage, which is what lets the live check compare them byte for byte. |
| Keeping dev out of search | `noindex` meta added at runtime | A per-stage `robots.txt` | A per-stage file needs a build step. Nothing links to dev, so a runtime tag is enough. |
| Live check | Compare the live site with the commit, file by file | Trust the deploy's exit code | A deploy can succeed and still serve stale or wrong files; comparing bytes proves what players get. |
| Role ARN | Repository secret, account ID masked | Repository variable | The repository is public, so its logs are too. |
| Local server | `npx serve` on a fixed port | Vite dev server; `python -m http.server` | No dependency and no build. Serves the exact files that deploy. |
| Cache policy | `no-cache` on all files | Hashed filenames; long max-age | Hashing needs a build step. With a handful of small files, revalidating every load is cheap and avoids stale-module mixes. |

## Open Questions & Future Decisions

### Deferred
1. Browser tests in the pipeline (Playwright) for canvas drawing and input, which are verified by hand today.
2. Longer caching with hashed filenames, if a build step is ever added.
3. A preview address per branch, if two change orders ever need to be on dev at once.

## References

- `docs/high-level-design.md` (Change Flow)
- `docs/change-orders/README.md`
- SST StaticSite: https://sst.dev/docs/component/aws/static-site
