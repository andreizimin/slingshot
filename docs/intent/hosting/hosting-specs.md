# Hosting — EARS Specs

Design: `hosting-design.md` · Prefix: `HOST`

## Site and stages

- [x] **HOST-001**: The repository shall keep every served file under `site/`, and the hosting configuration shall upload only `site/`.
- [x] **HOST-005**: The SST configuration shall define one `sst.aws.StaticSite` named `Slingshot` with `path: "site"`, no build command, in AWS region `us-east-1`.
- [x] **HOST-006**: Where the SST stage is `production`, the configuration shall attach `slingshot.andreizimin.com`; where it is `dev`, `slingshot-dev.andreizimin.com`; on any other stage, no custom domain. Removal shall be `retain` on `production` and `remove` elsewhere.
- [x] **HOST-007**: The SST configuration shall serve every uploaded file with `Cache-Control: no-cache`, and a deploy shall wait for its CDN invalidation to complete.
- [x] **HOST-008**: The project shall pin SST as a dev dependency at `^3.17`.
- [x] **HOST-009**: Before a stage's first deploy, the developer shall confirm that Route 53 has no existing record at that stage's domain and the parent site has no wildcard alias that would conflict; if one exists, the deploy shall not proceed until the conflict is resolved.
- [x] **HOST-012**: While the page is served from any hostname other than `slingshot.andreizimin.com`, it shall show a "DEV" badge and add a `noindex` robots meta tag; on `slingshot.andreizimin.com` it shall do neither.

## Local commands

- [x] **HOST-002**: When the developer runs `npm run dev`, the project shall serve `site/` over HTTP at `http://localhost:5173` using `npx -y serve@14 site -l 5173`.
- [x] **HOST-003**: When the developer runs `npm test`, the project shall run all suites in `tests/` with `node --test`.
- [x] **HOST-004**: When the developer runs `npm run deploy:dev` or `npm run deploy:prod`, the project shall run `npm test` and, only if it passes, deploy the `dev` or `production` stage with SST. These are a fallback for when the pipeline is unavailable.

## Pipeline

- [x] **HOST-011**: The pipeline shall run `npm test` and the coherence check on every push, and on pull requests from forks, on Node 22; pull requests from forks shall get no deploy and no credentials.
- [x] **HOST-013**: When a branch other than `main` is pushed and its tests and coherence check pass, the pipeline shall deploy it to the `dev` stage and then run the live-site check against `https://slingshot-dev.andreizimin.com`.
- [x] **HOST-014**: When `main` changes and its tests and coherence check pass, the pipeline shall deploy it to the `production` stage and then run the live-site check against `https://slingshot.andreizimin.com`.
- [x] **HOST-015**: The live-site check shall fail unless every file under `site/` is served with status 200 and a `Cache-Control` containing `no-cache`, matches the committed file byte for byte, and (for `.js` files) has a JavaScript content type, and unless the served page carries the Umami and feedback script tags; it shall retry for up to three minutes before failing.
- [x] **HOST-016**: Deploys to the same stage shall run one at a time; a later push shall wait for the running deploy and shall not cancel it.
- [x] **HOST-017**: The deploy job shall obtain AWS credentials only through GitHub's OIDC token for the `dev` or `production` environment, with the role's ARN read from a repository secret and the AWS account ID masked in logs.
- [x] **HOST-010**: A production deploy shall happen only by merging into `main` after the requester has checked the change on the dev site and said so explicitly.

## Verified by hand

These are steps a person takes or confirms, so no unit test can cite them: `HOST-009` (the Route 53 check before a stage's first deploy), `HOST-010` (the requester's dev check before a merge).
