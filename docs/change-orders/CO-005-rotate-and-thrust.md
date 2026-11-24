# CO-005: Rotate and thrust: steering with two knobs

| | |
|---|---|
| Type | Feature |
| Status | Approved |
| Requested | 2026-11-24 |
| Approved | 2026-11-24 |
| Completed | |
| Ticket | [ZZF-94](https://linear.app/zizify-workshop/issue/ZZF-94) |

## Request

"I need a simple navigation of the ship reworked - two knobs - angle and acceleration; change angle with minimal/no fuel change - this rotates the ship. then up/down accelerate in the direction the ship is pointing"

## Intent

Today the player has one control: push sideways (↑ ↓ or a vertical drag), measured relative to the planet the ship is nearest. The ship turns to face that push by itself. The request replaces this with two controls a player can see and reason about directly: **angle**, which rotates the ship's nose and costs no fuel, and **acceleration**, which fires the engine along the nose. Steering becomes "point, then burn", the way a real spacecraft is flown. The slingshot lesson is unchanged: which side of a world you pass still decides boost or brake. The player now chooses that side by aiming.

## Findings That Shape the Plan

- **This reverses a recorded decision.** The flight-sim LLD chose "sideways only" and lists "manual rotate-and-thrust" as a rejected alternative: one up/down control was the whole decision (which side). The decision row has to be rewritten with the new rationale: the player asked for direct control, and aiming is easy to explain with the ship drawn pointing.
- **The ship already has a heading.** `stepInPlace` turns the heading toward the wanted push at `TURN_RATE` and fires only when aligned (`ALIGN_TOLERANCE`, spool-up). Rotate-and-thrust keeps that machinery. Only who sets the target heading changes: the player instead of the sideways axis.
- **Planning has to change shape.** A plan is now a signed sideways amount (`planDv`, flown along the current sideways axis). It becomes a **heading plus a burn amount**: rotate the nose (free), then queue a forward or reverse burn of so many km/s. The prediction keeps showing exactly where the plan leads.
- **The level survives.** Its designed route, 3 km/s "down" at the start, is the same as "point the nose straight down (−90°), burn 3 km/s forward", because at the start "down" is −y. The proof tests can be re-expressed in the new controls without moving any world; they are rerun to confirm.
- **The tutorial teaches the old controls.** "Your speed" explains the orange sideways arrow ("the one you steer"), "Fuel, and planning is free" says "drag up or down", and "Your turn" says "drag DOWN to swing BEHIND". All of these are rewritten.

## Predicted Impact

Assumes the recommended answers below: rotation is free; ↓ fires in reverse; sideways steering is removed; on touch, a horizontal drag rotates and a vertical drag burns; planning stores a heading and a burn; the angle is absolute (screen up is up).

### HLD

- Approach: "The player steers by changing only the ship's sideways speed" becomes "The player aims the ship (free) and fires its engine forward or in reverse (fuel)".
- Key Design Decisions: none at HLD level. The steering decision lives in `flight-sim`.

### LLDs

| Component | Section | Change |
|---|---|---|
| `flight-sim` | Fuel and thrust | Replace "Only sideways speed can be changed" with rotate-and-thrust: a player-set target heading; turning is free at `TURN_RATE`; `'forward'` / `'reverse'` fire along / against the nose once aligned, with spool-up as now. |
| `flight-sim` | Planned manoeuvres | A plan becomes `{ heading, burn }`: a target heading and a signed burn in km/s (+ forward, − reverse), clamped to ±fuel, reversible. Flown on resume: turn, spool, burn, cut. |
| `flight-sim` | Frames and Readouts | `axes` / `speedComponents` stay for the arrows (toward the focus world, and sideways); add `heading` readout. |
| `flight-sim` | Decisions & Alternatives | Rewrite the "Steering" row; sideways-only becomes the rejected alternative. |
| `cockpit` | Controls | ← → rotate (free); ↑ forward burn, ↓ reverse burn. Touch: horizontal drag rotates, vertical drag burns. Help line and ready message rewritten. |
| `cockpit` | Readouts / Drawing | A heading indicator on the ship (nose line), the planned heading as a ghost ship outline, and the planned burn as a dashed arrow along the nose. Orange "sideways" arrow becomes informational; whether to keep it is decided at the LLD edge probe. |
| `tour` | Script | Steps 3–5 rewritten for aim-then-burn: "Your speed", "Fuel, and planning is free" (aim with ← →, burn with ↑ ↓), "Your turn: aim below the planet and burn". |
| `level` | Proving the Level | The designed route restated as "aim −90°, burn 3 km/s forward"; the forgiving-correction test restated the same way. Worlds unchanged. |
| `analytics` | Events | `slingshot_launch` `planned_dv` becomes the planned burn (signed). |

### Specs

| ID | Action | Text (summarized; exact wording at the EARS phase) |
|---|---|---|
| `SIM-FUEL-004` | Revise | Thrust directions are `'forward'` and `'reverse'` along the heading; anything else is no thrust. |
| `SIM-FUEL-005` | Revise | `planningBurn(state, dv)` adds a signed burn to the plan, clamped to ±fuel, reversible. |
| `SIM-FUEL-006` | Revise | The ship turns toward the target heading by at most `TURN_RATE` per step at no fuel cost, and fires only when within `ALIGN_TOLERANCE`. |
| `SIM-FUEL-007` | Revise | A queued plan is flown as: turn to its heading, then burn its amount along (or against) the nose. |
| `SIM-FUEL-008` | Add | `planHeading(state, heading)` sets the plan's target heading without spending fuel or time. |
| `SIM-FUEL-009` | Add | Rotating, held or planned, never spends fuel. |
| `COCKPIT-CTL-001` | Revise | ← / → rotate the target heading at a fixed rate while held; ↑ / ↓ fire forward / reverse. |
| `COCKPIT-CTL-008` | Revise | Pause-and-plan: ← → shape the planned heading, ↑ ↓ the planned burn. |
| `COCKPIT-CTL-009` | Revise | Drag: horizontal part rotates, vertical part burns. |
| `COCKPIT-DRAW-008`, `COCKPIT-DRAW-009` | Revise | Arrows and the planned display follow the new plan shape. |
| `COCKPIT-DRAW-013` | Add | While paused with a plan, a ghost outline of the ship at the planned heading. |
| `COCKPIT-HUD-005`, `COCKPIT-MSG-001`, `COCKPIT-MOB-002` | Revise | New help line and ready messages. |
| `TOUR-001`, `TOUR-003`, `TOUR-014` | Revise | Captions and the "Your turn" rule for aim-then-burn; side still recorded from the plan. |
| `LEVEL-004`, `LEVEL-006` | Revise | Routes expressed as heading + burn. |
| `ANA-002` | Revise | `planned_dv` = the planned burn. |

Net, roughly: +3 new, ~16 revised, 0 deleted.

### Tests

| File | Action | Specs covered |
|---|---|---|
| `tests/sim.test.js` | Change | Turning is free; forward/reverse thrust along the nose; planning heading + burn; reversibility; prediction fidelity with a plan |
| `tests/cockpit.test.js` | Change | Drag mapping (horizontal rotate, vertical burn); help and ready text |
| `tests/tour.test.js` | Change | New captions; "Your turn" achievable in real physics on both sides by aiming |
| `tests/level.test.js` | Change | Designed route and forgiving correction, re-expressed |

### Code

| File | Action | What changes |
|---|---|---|
| `site/sim/physics.js` | Change | Target heading, forward/reverse thrust, plan `{heading, burn}`, `planHeading` |
| `site/cockpit/main.js` | Change | Key and drag mapping, planning, ghost ship, arrows |
| `site/cockpit/view.js` | Change | Drag mapping, messages, launch event |
| `site/cockpit/tour.js` | Change | Captions, `inputAllowed` kinds (rotate, burn), side from the plan |
| `site/index.html` | Change | Help line |

### Other

Development log entry; the change-order index row.

## Cross-Segment Effects

- **flight-sim → cockpit, tour, level, analytics:** the steering model and the plan's shape are used everywhere. Every segment cascades; each is walked in turn.
- **tour:** the side of the pass is now inferred from the plan's aim (below the planet = behind), not from the sign of a sideways push.
- **level:** no layout change expected; if the re-expressed route fails, the level is re-solved with `scripts/design-level.mjs`, a predicted risk.

## Decisions Needed

None open. Decided on 2026-11-24: 1a (rotating is free), 2a (↓ is reverse thrust), 3a (sideways steering removed), 4a (one drag: horizontal rotates, vertical burns). Defaults kept: absolute angle; a plan is a heading plus a burn.

1. **What does rotating cost?** (a, recommended) Nothing: turning is free, at a fixed rate. (b) A tiny amount of fuel per turn.
2. **What does ↓ do?** (a, recommended) Fire in reverse: the engine pushes against the nose, so the player can slow down without turning around. (b) Nothing: only forward thrust; to slow down, turn around and burn.
3. **The old sideways steering.** (a, recommended) Remove it: one control scheme, everywhere. (b) Keep it as an alternative scheme.
4. **Touch and mouse.** (a, recommended) One drag does both: the horizontal part rotates, the vertical part burns. (b) On-screen knobs: a dial for angle and a slider or buttons for thrust.

Taken as the default unless you say otherwise: the angle is absolute (the nose points at a screen direction, not relative to the planet), and a plan stores a heading plus a burn.

## Risks and Edge Cases

- **Harder to fly for a 7-year-old.** Two controls are more to learn than one. The tutorial teaches aim then burn, one at a time; playing on dev is the test.
- **The level could become harder or easier.** Its proof tests run on the real sim with the new controls; if the designed route fails, the level is re-solved.
- **Planning feel.** Rotating while paused must update the prediction instantly; the prediction is already only computed while paused, so the cost is a recompute per rotation frame.
- **Reverse thrust and the tutorial's brake lesson.** Reverse thrust could make braking by flyby feel unnecessary. Fuel is still scarce (10 km/s against a 23.6 km/s mismatch in the level), so it can't replace the slingshot.

## Verification

- `npm test` and `npm run coherence`, including the level's proof tests and the tutorial's real-physics tests in the new controls.
- On dev, desktop and phone: aim and burn in free play; plan while paused (rotate, burn, cancel); the tutorial end to end on both sides; finish the level.

---

## Outcome

Filled in after the change is complete.
