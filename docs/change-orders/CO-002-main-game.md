# CO-002: The main game, first playable level

| | |
|---|---|
| Type | Feature |
| Status | In progress |
| Requested | 2026-11-23 |
| Approved | 2026-11-24 |
| Completed | |
| Ticket | [ZZF-92](https://linear.app/zizify-workshop/issue/ZZF-92) |

## Request

"next step - we do the game itself" … "go straight to CO2"

## Intent

After the tutorial, the player gets a real journey. They start with too little fuel to go anywhere on their own and must chain slingshots, one world to the next, to reach a destination. Each flyby borrows speed (behind the world) or sheds it (in front). Fuel left at the end is the score. This is the first playable version of the concept brief's "lily pond", kept to one level so it can be tuned by playing it, before missions, map reveal or story.

## Findings That Shape the Plan

- **The physics engine is a single star with one planet.** `site/sim/physics.js` integrates the ship under a fixed star and one planet on a prescribed circular orbit, using velocity Verlet with a fixed 30-second step. Flybys, the prediction line, sideways-only steering, queued manoeuvres and the acceptance tests all assume that one planet.
- **The brief's "lily" is ambiguous at real scale.** It describes "drifting star systems" a few slingshots apart. Real star systems are light-years apart, and no flyby crosses that distance in a game. Something has to give: what a lily is physically (decision 1), or how far apart lilies are. The HLD tenet *exaggerate the picture, never the physics* rules out bending gravity, so the choice is about scenario, not about the physics.
- **The cockpit is built around "the planet".** The camera is planet-centred; the sideways axis, speed arrows, path bend and Sun badge are all relative to one planet. With several worlds, "the planet" must become "the world you are near", and the camera and arrows must follow it.
- **The tutorial already promises a destination.** Its first card shows a story-only "Destination: far away" marker and ends with I'm ready, which today leads to free flight with a "full game coming soon" note. This change makes I'm ready lead into the level, and makes the destination real.
- **Lesson from the MVP:** the planned first scenario was unwinnable, and only a ten-line simulation showed it. So the level layout is designed with a solver: the positions, speeds and fuel are chosen so that a chained route exists with fuel to spare and the level cannot be finished on fuel alone. Both properties are acceptance tests.

## Options for What a Lily Is (decision 1)

**A. Worlds of one star system (a grand tour).** The lilies are planets orbiting one star, like Voyager's tour of Jupiter, Saturn, Uranus and Neptune. Each planet moves on its own orbit, and the ship hops outward. The physics is fully real, at real distances (hundreds of millions of km). Travel between worlds takes simulated years, so time control has to stretch further. The "map opens outward" idea fits naturally: inner worlds first, outer worlds later. The cost is a bigger physics change, with N planets on prescribed orbits and their periods and alignments to design. It also departs from the brief's picture of separate drifting systems.

**B. A pond of drifting systems (the brief, literally).** Each lily is a small star system: a star and a planet, as in the tutorial. The systems drift across a flat "pond" and are placed a few tens of million km apart, far closer than real stars. Inside a system, that system's gravity applies; between systems, the ship coasts. The pond picture is exactly the brief's. But the spacing is not real-world-range, which pulls against the tenet *exaggerate the picture, never the physics*, and stitching "nearest system only" gravity together is the kind of approximation the brief warns can look like a bug.

**C. A pond of drifting worlds (recommended).** Each lily is a single massive world (Jupiter-sized), drifting across the pond at its own speed and direction, with no star. The ship feels every world's gravity at once, which is real Newtonian physics with no stitching. A world's pull fades quickly with distance, so between worlds the ship effectively coasts. Spacing of a few million to a few tens of million km is realistic for a cluster of drifting bodies, and flybys behave exactly as in the tutorial, because the star barely mattered near the planet anyway. "Catch the lily moving the right way" is literal: a world drifting your way lends speed; one drifting against you takes it. This is the smallest honest step from today's engine. It drops the star (and the Star badge) in the level, while keeping it in the tutorial.

## Predicted Impact

The prediction below assumes the recommended answers (C, one level, a slow arrival, a three-star score). Other answers change mainly the flight-sim LLD and the level design; the rest is similar.

### HLD

- **Problem/Approach:** "Current scope" becomes the tutorial *plus* the first level. A new subsection, "The pond", describes drifting worlds, real gravity from every world, and fuel as the score.
- **Goals:** add "a player can finish the first level, and cannot finish it on fuel alone".
- **System Design:** add components for levels and the journey (decision-dependent names). The cockpit "follows the nearest world".
- **Non-Goals:** missions, map reveal, story, multiple levels, saving progress (all later).
- **Release Stages:** no change.

### LLDs

| Component | Section | Change |
|---|---|---|
| `flight-sim` | Units and Scenario; State and Stepping | A scenario holds a list of worlds, each a GM, a radius, a start position and a constant drift velocity. Gravity sums every world (plus the star in the tutorial scenario). Crash against any world. The tutorial scenario is unchanged and still passes its tests. |
| `flight-sim` | Frames and Readouts | "The planet" becomes "the nearest world": planet-relative position and velocity, the sideways axis and speed components are taken relative to the nearest world. Speed is measured in the pond frame. |
| `flight-sim` | Physical Acceptance Tests | Flyby speed conservation holds for each world in its own frame. |
| new `level` | New LLD | Level data (worlds, start, destination, fuel), the win and lose conditions, the arrival rule (decision 3), scoring (decision 4), and the designed route |
| `cockpit` | Camera; Readouts; Messages | The camera follows the nearest world and zooms out between worlds. A destination marker with its distance. The level's result card. No Star badge in the level. |
| `tour` | When It Shows | I'm ready starts the level. The free-flight note is retired. |
| `analytics` | Events | `slingshot_level_start`, `slingshot_level_end` (outcome, fuel left, stars, flybys) |
| `hosting`, `lid` | — | None |

### Specs

| ID | Action | Text (new or revised, summarized; exact wording at the EARS phase) |
|---|---|---|
| `SIM-SCN-*` | Add ~3 | Scenarios as lists of worlds with drift velocities; the tutorial scenario as one of them |
| `SIM-STEP-002` | Revise | Gravity sums every world in the scenario |
| `SIM-END-001`, `SIM-END-002` | Revise | Crash against any world; "departed" generalized or replaced by level end conditions |
| `SIM-READ-*` | Revise ~2 | Readouts relative to the nearest world; speed in the pond frame |
| `LEVEL-*` | Add ~10 | Level data, start, destination, arrival rule, fuel, win/lose, stars, and the two design properties (a chained route exists; fuel alone cannot finish) |
| `COCKPIT-CAM-*`, `COCKPIT-DRAW-*`, `COCKPIT-MSG-*` | Revise ~5, add ~4 | Follow the nearest world; destination marker; level result; no Star badge in the level |
| `TOUR-013` | Revise | I'm ready starts the level |
| `ANA-*` | Add 2 | Level start and end events |

Net, roughly: +19 new, ~10 revised, 0–1 deleted.

### Tests

| File | Action | Specs covered |
|---|---|---|
| `tests/sim.test.js` | Change | Multi-world gravity; nearest-world readouts; the tutorial scenario unchanged |
| `tests/level.test.js` | Add | Level rules; **solver tests**: a chained route reaches the destination with fuel left, and no fuel-only route does |
| `tests/cockpit.test.js` | Change | Camera follows the nearest world; destination marker; result card |
| `tests/tour.test.js` | Change | I'm ready leads to the level |

### Code

| File | Action | What changes |
|---|---|---|
| `site/sim/physics.js` | Change | Worlds list, multi-body gravity, nearest-world frames; tutorial scenario as data |
| `site/sim/levels.js` | Add | Level 1 data |
| `site/cockpit/level.js` | Add | Pure level rules (arrival, win/lose, stars) |
| `site/cockpit/view.js`, `main.js`, `index.html`, `style.css` | Change | Camera, destination marker, result card, level flow |
| `site/cockpit/tour.js` | Change | I'm ready → level |
| `scripts/design-level.mjs` | Add | The solver used to place the worlds and prove a route exists |

### Other

- Development log entry; the change-order index row.
- The concept brief stays as is: it is the long-term vision, and this is its first step.

## Cross-Segment Effects

- **flight-sim → cockpit, tour:** "the planet" is a single-planet idea used across the cockpit's camera, arrows, path bend and the tour's highlights. The tour keeps its one-planet scenario, so its behaviour must not change; its tests guard that.
- **tour → level:** I'm ready changes where it leads.
- **analytics:** two new events, no change to existing ones.

## Decisions Needed

None open. Decided on 2026-11-24:

1. **What a lily is:** C, a pond of drifting worlds. Each lily is a single massive world drifting at constant velocity; the ship feels every world's gravity at once; there is no star in the level.
2. **Scope:** one hand-designed level of 3–4 worlds between the start and a destination world, proven by a solver and tuned by playing it on dev.
3. **Arriving:** reach the destination world slowly enough to be caught by it.
4. **Score:** 1–3 stars by fuel left; any arrival earns 1 star.

## Risks and Edge Cases

- **The level could be unwinnable or trivial.** This is guarded by the solver and two acceptance tests: a chained route exists with fuel to spare, and no route on fuel alone reaches the destination.
- **The tutorial must not change.** It keeps its star-and-planet scenario; every tour and physics test must still pass.
- **"Nearest world" can flip mid-flight** between two worlds, so the camera and arrows could jump. The camera eases, and the rule for which world the arrows refer to is pinned down at the LLD edge probe.
- **Long empty coasts between worlds could be boring.** Fast time and a zoomed-out view between worlds cover it; spacing is tuned by playing on dev.
- **Performance:** gravity from 4–5 worlds per step, times the prediction's 20,000 steps per frame. This is measured before code; the prediction horizon can shrink if needed.

## Verification

- `npm test` and `npm run coherence` pass, including the solver tests and every existing tutorial test.
- On dev: play the tutorial, press I'm ready, finish the level with a chained route, and fail it at least once (crash, or overshooting the destination). Check on a phone and a desktop.
- The LID phases run in full: an edge-case probe on each new or changed design doc, an edge audit before tests, and the semantic report at the end, recorded in the Outcome.

---

## Outcome

Filled in after the change is complete.

### Predicted vs Actual

| Level | Predicted | Actual | Notes |
|---|---|---|---|
| HLD | 4 changes | | |
| LLDs | 3 changed, 1 new (`level`) | | |
| Specs | +~19 ~~10 −0–1 | | |
| Tests | 4 files | | |
| Code | ~10 files | | |

### Surprises

### Commits

| Hash | Message |
|---|---|

### Measurements

| | |
|---|---|
| Tests before → after | unit 82 → |
| Lines changed | |
| Agent time | |
| Deployed | |
