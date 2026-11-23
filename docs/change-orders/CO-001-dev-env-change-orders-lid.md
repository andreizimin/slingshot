# CO-001: Dev environment, change orders, CI/CD and LID finalized

| | |
|---|---|
| Type | Feature |
| Status | In progress |
| Requested | 2026-11-23 |
| Approved | 2026-11-23 |
| Completed | |
| Ticket | [ZZF-89](https://linear.app/zizify-workshop/issue/ZZF-89) |

## Request

"now set up slingshot-dev and make subsequent changes as COs with listing the intent changes - make sure we finalize the LID framework for the project. next step - we do the game itself"

## Intent

Before the main game is built, every change should follow one predictable path. It starts as a change order that predicts its effect on every level of the arrow of intent. It lands on `slingshot-dev.andreizimin.com` for the requester's single check, and reaches production on their go, with no other manual steps. The project's LID setup is completed so that any session, cloud or local, works from the same skills, conventions and checks.

## Findings That Shape the Plan

- **Only production has a domain.** `sst.config.ts` attaches `slingshot.andreizimin.com` to the `production` stage only. Every deploy so far ran `sst deploy --stage production` from the developer's laptop, after a local review on `localhost`.
- **The account is ready for pipeline deploys.** AWS already trusts GitHub Actions through an OIDC provider. Each personal project deploys through its own `gha-deploy-<repo>` role, which trusts only that repository's `dev` and `production` GitHub environments, so there are no long-lived keys. Slingshot has no role yet.
- **The site has no build step.** The same files are served on every stage, so anything that must differ on dev (a DEV marker, keeping search engines out) has to be decided at runtime from the hostname, or by adding a build step.
- **The feedback widget already labels dev correctly.** It treats a hostname containing `-dev.` as `Env: dev`, so feedback from `slingshot-dev.andreizimin.com` will not be marked as production.
- **LID is on 1.3.0 and only on the laptop.** `AGENTS.md` declares `- Version: 1.3.0`, and the skills live only in the developer's local plugin cache, so a cloud session has none. learn-mandalorian vendored `linked-intent-dev` and `update-lid` at v1.4.2 into `.claude/skills/` (its CO-015). The 1.3 → 1.4 migration is mechanical: refresh the instruction file's LID section to the 1.4 template.
- **Coherence is checked by hand.** Every change so far ended with an in-prompt check that each `@spec` points at a real spec and each behavioural spec has a test. There is no script, so drift is caught only when someone remembers to look.
- **History lives in the conversation and in Linear.** The MVP, beta, tour and tutorial changes (ZZF-80 to ZZF-88) predate change orders. Nothing in the repository says how the game got here.

## Predicted Impact

### HLD

- **System Design:** the Hosting row and diagram name both addresses: production at `slingshot.andreizimin.com`, dev at `slingshot-dev.andreizimin.com`.
- **New section, "Change Flow":** change order → branch → push (tests, dev deploy, live check) → the requester's dev check → merge → production deploy and live check. It names the one manual step.
- **References:** add `docs/change-orders/` and `docs/development-log.md`.

### LLDs

| Component | Section | Change |
|---|---|---|
| `hosting` | Repository Layout | Add `.github/workflows/ci.yml`, `scripts/live-check.mjs`, `bin/coherence-check.mjs`, `docs/change-orders/` |
| `hosting` | Deploy | Stages and domains: `production` gets the production domain, `dev` the dev domain, any other stage a throwaway URL. The laptop deploy becomes a fallback (`deploy:dev`, `deploy:prod`). |
| `hosting` | New: Deploy Pipeline | Which push deploys where, the GitHub environments and AWS role, one deploy per stage at a time, and the live-site check after each deploy |
| `hosting` | New: Dev Stage | How the page recognises dev at runtime: a "DEV" marker and `noindex` (decision 3) |
| `hosting` | Local Preview | Local review stays available. The requester's check moves to the dev site. |
| `hosting` | Decisions & Alternatives | Rows for pipeline deploys over laptop deploys, deploying production on merge, and runtime stage detection over a build step |

### Specs

| ID | Action | Text (new or revised) |
|---|---|---|
| `HOST-004` | Revise | When the developer runs `npm run deploy:dev` or `npm run deploy:prod`, the project shall run `npm test` and, only if it passes, deploy that stage with SST. These are a fallback for when the pipeline is unavailable. |
| `HOST-006` | Revise | Where the SST stage is `production`, the configuration shall attach `slingshot.andreizimin.com`; where it is `dev`, `slingshot-dev.andreizimin.com`; on any other stage, no custom domain. Removal shall be `retain` on `production` and `remove` elsewhere. |
| `HOST-010` | Revise | A production deploy shall happen only by merging into `main` after the requester has checked the change on the dev site and said so explicitly. |
| `HOST-011` | Revise | The pipeline shall run `npm test` and the coherence check on every push and pull request, on Node 22, with read-only permissions for the test job. |
| `HOST-012` | Add | While the page is served from any hostname other than `slingshot.andreizimin.com`, it shall show a "DEV" marker and tell search engines not to index it (decision 3). |
| `HOST-013` | Add | When a branch other than `main` is pushed and its tests and coherence check pass, the pipeline shall deploy it to the `dev` stage and then run the live-site check against `slingshot-dev.andreizimin.com`. |
| `HOST-014` | Add | When `main` changes and its tests and coherence check pass, the pipeline shall deploy it to the `production` stage and then run the live-site check against `slingshot.andreizimin.com`. |
| `HOST-015` | Add | The live-site check shall fail unless every file under `site/` is served with status 200 and `Cache-Control: no-cache`, the served files match the commit being deployed byte for byte, and the page carries the Umami and feedback tags. |
| `HOST-016` | Add | Deploys to the same stage shall run one at a time, in push order. |
| `LID-001` | Add | The coherence check shall fail when any `@spec` annotation in `site/` or `tests/` names an ID that no spec file defines, when a spec file defines the same ID twice, or when a spec marked `[x]` in the analytics, cockpit view, flight-sim or tour specs is cited by no test and its spec file does not list it as verified by hand. |

Net: +6 new, ~4 revised, 0 deleted. `LID-001` goes in a new `docs/intent/lid/lid-specs.md` owned by a short LLD for project process.

### Tests

| File | Action | Specs covered |
|---|---|---|
| `tests/hosting.test.js` | Add | `HOST-006` (domains per stage, read from `sst.config.ts`), `HOST-011` (workflow shape), `HOST-013`, `HOST-014`, `HOST-016` (deploy jobs, branch conditions, concurrency, read from `ci.yml`) |
| `tests/stage.test.js` | Add | `HOST-012` (hostname to stage, DEV marker and `noindex` decision) |
| `tests/coherence.test.js` | Add | `LID-001` (the checker on small fixture trees: missing ID, duplicate ID, untested spec, hand-verified exemption) |
| `tests/cockpit.test.js` | Change | Move the CI-shape test into `tests/hosting.test.js` |

`HOST-015` is the live check itself and runs only against a deployed address, never in `npm test`.

### Code

| File | Action | What changes |
|---|---|---|
| `sst.config.ts` | Change | Domain for `dev` as well as `production` |
| `site/cockpit/stage.js` | Add | `stageForHost(hostname)`, pure |
| `site/cockpit/main.js` | Change | On a non-production host: add the `noindex` meta and show the DEV marker |
| `site/index.html`, `site/style.css` | Change | DEV marker element and style |
| `.github/workflows/ci.yml` | Add | Replaces `test.yml`: test job, dev deploy on branches, production deploy on `main`, live check after each deploy, per-stage concurrency |
| `.github/workflows/test.yml` | Delete | Folded into `ci.yml` |
| `scripts/live-check.mjs` | Add | The live-site check (`HOST-015`) |
| `bin/coherence-check.mjs` | Add | The coherence check (`LID-001`) |
| `package.json` | Change | `deploy:dev`, `deploy:prod`, `test:live`, `coherence` scripts |

### Other

- **Change orders:** `docs/change-orders/README.md` (how a change flows, numbering, index), `TEMPLATE.md`, and this file as CO-001.
- **`AGENTS.md`:**
  - a **Change Orders (MANDATORY)** section with the one-check flow and the explicit dev-check question;
  - the LID section refreshed to the v1.4.2 template, with the vendored skills named;
  - `## LID` `- Version: 1.4.2` and a `## LID Tooling` block naming `bin/coherence-check.mjs`;
  - the Commands table updated for the pipeline and fallback deploys.
- **Vendored skills:** `.claude/skills/linked-intent-dev/` and `.claude/skills/update-lid/` at v1.4.2, unmodified, each with `LICENSE` and `SOURCE.md` (copied from learn-mandalorian's vendored copy, which is byte-identical to upstream `v1.4.2`).
- **`docs/development-log.md`:** how the game was built so far: MVP, beta, tour, tutorial, decisions and timeline, with ticket links.
- **AWS, one-time, needs your approval (decision 2):** a role `gha-deploy-slingshot` trusting only this repository's `dev` and `production` environments, like the other `gha-deploy-*` roles.
- **GitHub, one-time:** environments `dev` (any branch) and `production` (`main` only), and a repository variable `AWS_ROLE_ARN`.
- **Memory:** project notes updated to the change-order flow.

## Cross-Segment Effects

- **cockpit:** gains the DEV marker on non-production hosts, and its CI-shape test moves to hosting. No gameplay changes.
- **Every segment, through process only:** every later change, starting with the main game, goes through a change order and the dev check.

## Decisions Needed

None open. Decided on 2026-11-23:

1. **Stops:** only the dev check. Decisions are asked in one round at the start; the change then goes to dev without stopping.
2. **AWS deploy role:** `gha-deploy-slingshot` with AdministratorAccess, trusting only this repository's `dev` and `production` GitHub environments.
3. **Telling dev apart:** at runtime from the hostname, with no build step: a DEV badge and a `noindex` meta tag on any host other than production.
4. **LID version:** vendor `linked-intent-dev` and `update-lid` at v1.4.2 and apply the 1.3 → 1.4 migration.

## Risks and Edge Cases

- **A bad production deploy:** the live check fails the run and I report it at once. Recovery is a revert pull request through the same pipeline.
- **The dev check refers to a specific commit.** If the branch moves after I report it on dev, I say so and ask again before merging.
- **Two branches at once:** dev shows the last branch pushed. One change order at a time keeps this simple.
- **Search engines and runtime `noindex`:** crawlers that do not run JavaScript would still see dev. This is acceptable for a dev site with no links to it. Decision 3's alternative closes that gap.
- **This change's own rollout:** the pipeline can't deploy itself before it exists. The role and environments are created first, then this branch's push is the pipeline's first dev deploy.
- **Fallback:** `npm run deploy:dev` and `npm run deploy:prod` still work from the laptop.

## Verification

- `npm test` passes with the new hosting, stage and coherence tests, and `npm run coherence` passes on the current tree.
- The live-site check passes against today's production site before any pipeline change.
- On this branch: a push runs tests and the coherence check, deploys to `slingshot-dev.andreizimin.com` and passes the live check, with no command from my laptop.
- You check dev: the game is unchanged except for the DEV badge. Then you say go.
- The merge deploys production through the pipeline, and the live check passes there.
- The development log reads cold and matches the Linear history.

---

## Outcome

Filled in after the change is complete.

### Predicted vs Actual

| Level | Predicted | Actual | Notes |
|---|---|---|---|
| HLD | 3 changes | | |
| LLDs | 6 sections (hosting), 1 new LLD (lid) | | |
| Specs | +6 ~4 −0 | | |
| Tests | 4 files | | |
| Code | 10 files | | |

### Surprises

### Commits

| Hash | Message |
|---|---|

### Measurements

| | |
|---|---|
| Tests before → after | unit 59 → |
| Lines changed | |
| Agent time | |
| Deployed | |
