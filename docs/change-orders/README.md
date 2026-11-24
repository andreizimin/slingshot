# Change Orders

Every change to Slingshot (feature, bug or minor fix) starts as a change order. That is a document that predicts, before any work begins, everything the change will touch along the arrow of intent: HLD → LLDs → specs → tests → code. When the change is done, its Outcome section records what was actually touched, so each change shows how well intent predicted code.

## How a Change Flows

1. **Request.** The change is described in conversation or as a Linear ticket in the **Slingshot** project (team ZZF).
2. **Change order.** A new `CO-NNN-short-slug.md` is written from [TEMPLATE.md](TEMPLATE.md) with status *Proposed*. It covers the predicted impact at every level, cross-segment effects, decisions needed, risks and the verification plan. No design doc, spec, test or code changes before this.
3. **Decisions.** If the change order has Decisions Needed, they are asked all at once, in one round, with a recommendation first. With the answers recorded, it is *Approved*.
4. **Work.** On a branch named after the ticket, the change walks the LID arrow as predicted, with no further stops. When the work departs from the prediction, the change order is updated rather than the departure going unrecorded.
5. **Dev.** Pushing the branch runs the tests and the coherence check, deploys to `slingshot-dev.andreizimin.com` and runs the live-site check.
6. **The one manual step.** The requester checks the reported commit on dev and says so explicitly. Merging into `main` then deploys production and runs the live-site check there.

The Outcome, the status *Done* and the row below are written before the dev check (step 5), so nothing is left to commit after the merge; the status takes effect when the merge lands, and is set back if the requester sends the change back.

## Numbering

`CO-001`, `CO-002`, and so on, never reused. The slug is a few lowercase words, for example `CO-002-main-game-map.md`.

Changes before CO-001 (the MVP, beta, getting-started tour and tutorial, tickets ZZF-80 to ZZF-88) are recorded in [`docs/development-log.md`](../development-log.md).

## Index

| ID | Title | Type | Status | Specs predicted | Specs actual |
|---|---|---|---|---|---|
| [CO-001](CO-001-dev-env-change-orders-lid.md) | Dev environment, change orders, CI/CD and LID finalized ([ZZF-89](https://linear.app/zizify-workshop/issue/ZZF-89)) | Feature | Done | +6 ~4 | +8 ~7 |
| [CO-002](CO-002-main-game.md) | The main game, first playable level ([ZZF-92](https://linear.app/zizify-workshop/issue/ZZF-92)) | Feature | Done (2026-11-24) | +~19 ~~10 | +30 ~~23 |
| [CO-003](CO-003-onboarding-redesign.md) | Onboarding that stays out of the way, and a choice at the door ([ZZF-93](https://linear.app/zizify-workshop/issue/ZZF-93), [ZZF-90](https://linear.app/zizify-workshop/issue/ZZF-90)) | Feature | In progress | +3 ~9 | |
| [CO-004](CO-004-trajectory-stays-fixed.md) | "The trajectory stays fixed" ([ZZF-91](https://linear.app/zizify-workshop/issue/ZZF-91)), delivered in CO-003 | Bug | In progress | +1 ~2 | |
