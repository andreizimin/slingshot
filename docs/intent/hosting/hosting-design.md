---
parent: high-level-design
prefix: HOST
---

# Hosting

## Context and Design Philosophy

Slingshot is a static site: an `index.html`, a stylesheet, and JavaScript ES modules, with no build step. Hosting serves those files over HTTPS at `slingshot.andreizimin.com`, and before any deploy the game can be played locally from the same files.

The parent domain `andreizimin.com` is already served from AWS (Route 53 hosted zone, CloudFront), so the subdomain lives in the same account and zone.

## Repository Layout

```
site/                 # everything that gets served; nothing else is uploaded
  index.html
  style.css
  sim/                # flight-sim modules (no DOM)
  cockpit/            # cockpit modules
tests/                # node --test suites, import from ../site/sim/
docs/
sst.config.ts
package.json          # "type": "module"; scripts: test, dev, deploy
```

Keeping the served files in `site/` means docs, tests, and `node_modules` are never uploaded.

## Local Preview

`npm run dev` runs `npx -y serve@14 site -l 5173`, serving `site/` over HTTP at `http://localhost:5173` with a pinned zero-config static server that needs no project dependency. ES modules do not load from `file://` URLs, so opening `index.html` directly is not supported.

Local preview serves exactly the files that would be deployed, so what is tested locally is what ships. **A deploy happens only after the developer has played the local build and approved it.**

## Deploy

Infrastructure is defined with SST v3 (`sst.config.ts`), matching the parent domain's setup:

- One `sst.aws.StaticSite` named `Slingshot`, `path: "site"`, no build command.
- AWS region `us-east-1`.
- On the `production` stage only, `domain: { name: "slingshot.andreizimin.com" }`. SST finds the existing `andreizimin.com` Route 53 zone, issues the ACM certificate, and creates the alias record. Other stages get a throwaway CloudFront URL.
- `removal: "retain"` on `production`, `"remove"` on other stages.

- Every uploaded file is served with `Cache-Control: no-cache`, so browsers revalidate on each load and never mix a new `index.html` with old modules. The files are small enough that revalidation costs nothing noticeable.

SST is pinned as a dev dependency (`sst@^3.17`, the major version the parent domain uses). `npm run deploy` runs `npm test && sst deploy --stage production`: tests gate every deploy, and the stage is always named explicitly, so no stray personal stage is created. Deploy uses the developer's local AWS credentials for the account that holds the `andreizimin.com` hosted zone; if SST cannot find that zone, the deploy is stopped and the active AWS profile checked, not worked around.

Before the first deploy, Route 53 is checked for an existing `slingshot.andreizimin.com` record and for a wildcard alias on the parent's distribution. If either exists, the conflict is resolved with the developer before deploying.

The first deploy takes several minutes while CloudFront and the certificate are created; later deploys only upload changed files and invalidate the cache.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Host | AWS S3 + CloudFront via SST `StaticSite` | Cloudflare, Vercel, GitHub Pages; hand-made S3 bucket | The parent domain's DNS and certificates are in AWS. SST handles the certificate, DNS, and invalidation in one resource, as the developer's other sites do. |
| Served folder | `site/` only | Repository root | Nothing but game files is uploaded. |
| Local server | `npx serve` style static server on a fixed port | Vite dev server; `python -m http.server` | No dependency and no build. Serves the exact files that deploy. |
| Domain only on `production` | Yes | Always attach domain | Test stages can't claim the subdomain. |
| Cache policy | `no-cache` on all files | Hashed filenames; long max-age | Hashing needs a build step. With a handful of small files, revalidating every load is cheap and avoids stale-module mixes. |
| Deploy gate | `npm test &&` in the deploy script | Documented convention only | A convention gets skipped; the script can't. |

## Open Questions & Future Decisions

### Deferred
1. CI-driven deploys. This slice deploys from the developer's machine.
2. Longer caching with hashed filenames, if a build step is ever added.

## References

- `docs/high-level-design.md`
- SST StaticSite: https://sst.dev/docs/component/aws/static-site
