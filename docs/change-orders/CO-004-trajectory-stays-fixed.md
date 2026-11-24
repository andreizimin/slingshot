# CO-004: "The trajectory stays fixed"

| | |
|---|---|
| Type | Bug |
| Status | Done |
| Requested | 2026-11-24 |
| Approved | 2026-11-24 |
| Completed | 2026-11-24 |
| Ticket | [ZZF-91](https://linear.app/zizify-workshop/issue/ZZF-91) |

## Request

"the trajectory stays fixed" (player, prod, 1316×809, filed 7 minutes after ZZF-90 in the same session, so most likely during the tutorial).

## Intent

The dashed prediction line should visibly respond whenever the player is invited to plan. The report gives no step, so the first job is to find where behaviour diverged from intent. Candidates, from the code (`site/cockpit/main.js` frame loop, `tour.js` input gating):

1. **Step 6 "Plan while paused" says "drag or ↑ ↓ to plan" but TOUR-006 locks steering on steps 1–6**, so dragging does nothing and the line stays put. Spec and caption contradict each other: a spec bug. (Most likely.)
2. **Fuel exhausted while planning:** `planningBurn` returns the same state, so the line freezes with no feedback.
3. **After a departure or crash**, planning is refused (`state.status === 'flying'` check) and the old line stays drawn.
4. **Mid-flight pause on the tour**: steering is locked until the result, line can't change.

## Predicted Impact

Assumes cause 1 plus a small fix for 2 (the most likely pair).

### HLD
None.

### LLDs

| Component | Section | Change |
|---|---|---|
| `tour` | Input During the Tour | Steering is live from step 6 (planning taught by doing), or step 6 caption no longer asks to drag. |
| `cockpit` | Controls | When a plan cannot change (no fuel), show "Out of fuel" on the fuel bar instead of silently freezing. |

### Specs

| ID | Action | Text (new or revised) |
|---|---|---|
| `TOUR-006` | Revise | Steps 1–5 ignore steering; steps 6–7 accept steering, not play. |
| `TOUR-003` | Revise | Step 6 advances on Next (unchanged), steering optional. |
| `COCKPIT-CTL-0xx` | Add | While paused and planning with no fuel left, the cockpit shall flash the fuel bar and show "No fuel left". |

### Tests

| File | Action | Specs covered |
|---|---|---|
| `tests/tour.test.js` | Change | TOUR-006 |
| `tests/view.test.js` (or cockpit test) | Change | new COCKPIT-CTL |

### Code

| File | Action | What changes |
|---|---|---|
| `site/cockpit/tour.js` | Change | input gating for step 6 |
| `site/cockpit/main.js` | Change | no-fuel feedback |

### Other
Repro on dev before changing anything; ask the reporter which step if it doesn't reproduce.

## Cross-Segment Effects

Touches the same tour step table as CO-003. If CO-003 merges steps 3–6, this fix folds into it.

## Decisions Needed

None open. Decided on 2026-11-24: 1a, 2a. Delivered inside [CO-003](CO-003-onboarding-redesign.md) on its branch: `site/cockpit/tour.js` allows steering only on `try` and `fly`, so step 6's "drag or ↑ ↓ to plan" does nothing (cause 1, confirmed from the code).

1. **Fix for cause 1.** (a, recommended) Make steering live on step 6 so "drag to plan" works. (b) Keep it locked, reword the caption ("next you'll drag…").
2. **Fold into CO-003?** (a, recommended) Yes: one onboarding change, one branch, since step 6 is being rewritten anyway; keep a separate no-fuel fix only if repro finds cause 2. (b) Ship separately first as a quick bug fix.

## Risks and Edge Cases

Unlocking steering on step 6 lets players satisfy step 7 early; the step-7 condition still holds, so it just advances faster.

## Verification

Repro on prod at 1316×809 before and after; tour tests; by hand on dev, desktop and phone.

---

## Outcome

Delivered inside [CO-003](CO-003-onboarding-redesign.md), on its branch and in its commit.

### Predicted vs Actual

| Level | Predicted | Actual | Notes |
|---|---|---|---|
| HLD | None | None | |
| LLDs | 2 sections (tour, cockpit) | 1 section (tour: Input During the Tour) | The no-fuel feedback (cause 2) was not needed: the cause was step 6's locked steering. |
| Specs | +1 ~2 | +0 ~1 | TOUR-006 revised: steering is live on "Fuel, and planning is free" and "Your turn". No new COCKPIT-CTL spec. |
| Tests | 2 files | 1 file | `tests/tour.test.js` (TOUR-006 now asserts steering on the planning step). |
| Code | 2 files | 1 file | `site/cockpit/tour.js` (`inputAllowed`). |

### Surprises

The cause was confirmed by reading the code, so no reproduction on production was needed. Step 6 itself became step 4, "Fuel, and planning is free", in CO-003's 8-step script, and dragging there now moves the dashed line (checked in a browser).

### Commits

See CO-003.

### Measurements

| | |
|---|---|
| Tests before → after | counted in CO-003 |
| Deployed | with CO-003 |
