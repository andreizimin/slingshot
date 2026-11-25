# Development Log

How Slingshot was built: what was made, in what order, what was decided and why, and what went wrong along the way. The design docs say what the game *is*; this file says how it got there. Changes from CO-001 onward are recorded in their change orders (`docs/change-orders/`), and this log gets a short entry for each.

## Before This Repository

An earlier attempt handed a full game specification to an agent in one pass. It did not produce a working game. The lesson shaped everything here: build small vertical slices, each with a physical acceptance test, and ship each one before starting the next.

## 2026-11-22: The First Vertical Slice (MVP)

**Goal.** One star, one planet, one ship: pass behind the planet to speed up, in front to slow down. Timeboxed to about half an hour of building.

**Intent first.** The concept brief (`docs/slingshot-context.md`) became an HLD and three LLDs (flight sim, cockpit, hosting) with EARS specs before any code.

- *Architecture.* Three options were sketched: plain JavaScript modules with no build step; Vite with TypeScript; a single HTML file. No-build won: fewest moving parts, and the physics stays importable by Node tests, which a single file would not allow.
- *Tenets.* Shipped slice over polish; kid-readable over complete; exaggerate the picture, never the physics. The third was first written as "engaging over physics truth" and corrected in review: the physics stays true, and only the picture (ship and planets drawn at comparable sizes) is exaggerated.
- *A mockup before code.* A static mockup of the cockpit fixed the look: navy sky, a banded planet, a small rocket, one big speed number.

**The gap review that saved the slice.** An independent read of the LLDs, with its own simulation, found that the planned starting scenario was unwinnable: starting 3 million km out with 10 km/s of *local* speed left only about 4 km/s far from the planet, so Jupiter captured nearly every approach, and the fuel budget could only escape by burning everything at once. The scenario was changed before any code existed: start 4 million km out with a 10 km/s *hyperbolic excess* speed, gentler thrust, a larger budget. The same review moved time control from steps per frame to steps per real second (a 120 Hz screen would otherwise have run the game twice as fast) and took thrust out of the stored state (it was leaking into the prediction).

**Built and shipped.** Velocity Verlet with a fixed 30-second step, a prediction line from the same integrator, pause and three speeds, a planet-centred camera with automatic zoom. Twenty-one physics tests by the first commit, including the brief's acceptance test: in the planet's frame, exit speed equals entry speed within 0.1%. Deployed to `slingshot.andreizimin.com` with SST. The repository was made public after an audit of every file and of the commit metadata.

**Shortcuts taken for the timebox, on the record:** the specs, edge audit and tests were not reviewed phase by phase; the cockpit had no automated tests; the work went straight to `main` with no tickets or branches.

## 2026-11-22 to 23: Playing It and Changing It

A round of fast changes on `localhost`, each tried by hand, often on a phone on the same network:

- **Phones and mice.** Drag anywhere to push; responsive layout; no page scrolling during a drag.
- **Planning is free.** Play-testing showed that burning fuel while paused felt wrong: pausing is for mapping a course, not spending. Planning became a queued manoeuvre that costs nothing until flown and can be undone by dragging back.
- **Steering takes time.** The ship now turns to face a push and its engine spools up, with a visible flame.
- **Only sideways.** The biggest simplification: the player controls only the speed *sideways* to the planet, which is the one thing that decides which side they pass. Two arrows on the ship show speed toward the planet and sideways speed.
- **Two modes.** The prediction line became a planning tool shown only while paused; while flying, the screen shows only what is happening.
- **Smaller things.** Fuel doubled so a mistake is recoverable; game speeds tuned by hand with a temporary tuner to 200 / 800 / 3300 steps per second; paths bent smoothly around the drawn planet, because an inflated planet made true paths look like they cut through it; "Star", not "Sun".

The design docs fell behind during this round. They were caught up afterwards, and that drift is one reason change orders and a coherence check now exist.

## 2026-11-23: Beta (ZZF-80 to ZZF-85)

The owner's standing checklist says a project becomes a beta when it has analytics, a feedback channel, tracked work, tests for its interface logic, and CI. All five were added in one branch:

- **Umami analytics** on the shared andreizimin.com website: cookieless, three flight events, counts only.
- **The shared feedback widget**, with game keys ignored while its form is open.
- **A Linear project**, with a ticket per change from here on.
- **Cockpit tests.** The cockpit's decisions moved into a pure module (`view.js`) so they run under `node --test`.
- **CI** running the tests on every push.

An independent review of the branch found no code bugs and seven places where docs described superseded behaviour; all were fixed before the merge.

## 2026-11-23: The Tutorial (ZZF-87, ZZF-88)

The MVP became the game's "getting started": a guided walk over the frozen game, in the pattern of learn-mandalorian's intro. The camera moves to each thing, a caption card pops up beside it, and the player taps on.

- It opens on a close-up of the ship: heading for a planet, with nowhere near enough fuel for its (story-only) destination.
- It ends hands-on: the player plans a pass, flies it, and gets a mid-swing checkpoint explaining how the planet's pull changes their speed, then the result.
- Both sides are taught. Passing behind boosts; passing in front brakes, and the checkpoint says so in those words.
- It always starts on load, and ends with **I'm ready**, which leads into free flight until the main game exists.

**Reviews earned their keep twice.** The first found five problems a player would hit (R ending the tour mid-flight, a silent pause, the phone card under the feedback button, motion that ignored reduced-motion, HUD elements jumping when highlighted). The second, on the both-sides change, found that the side chosen at launch was dropped the moment play began, so a pass in front would have been explained as a boost. The unit tests had missed it because they built the tour state by hand instead of walking the real step sequence; a regression test now walks it.

## 2026-11-23: CO-001, the Process Itself

With the main game next, the way changes are made was fixed first: a dev site at `slingshot-dev.andreizimin.com`, a pipeline that tests, deploys and checks the live site on every push, a change order before every change, the LID skills vendored into the repository, and a coherence check that fails the pipeline when a spec is untested or an annotation points nowhere. See [CO-001](change-orders/CO-001-dev-env-change-orders-lid.md).

The coherence check's first run was instructive: it found five flight-sim specs with no test (tests were added) and six cockpit specs still marked as gaps although their feature had shipped the day before.

## 2026-11-24: CO-002, the First Level

The tutorial now leads into the game itself: three drifting worlds with no star. The player starts next to Home and has to reach Haven, arriving slowly enough to be caught, scoring 1–3 stars by the fuel left. See [CO-002](change-orders/CO-002-main-game.md).

**A level is only proven in the engine that runs it.** The first layout was solved in a lighter prototype and failed once turning, spool-up and focus switching were in. The layout that shipped was checked against the game's own physics, including how forgiving it is to a wrong first push.

**A green test suite can still ship a blank screen.** The cockpit has no unit tests in a browser, and a change in the prediction's format broke it on the first frame. A headless browser that reads the console now runs after every physics change.

## 2026-11-24: CO-003 and CO-004, a Choice at the Door

The first feedback from players through the widget was about the tutorial: its cards covered the game, and not everyone wants an interactive tutorial. The game now opens on a start screen offering Tutorial or Sample mission; the tutorial is eight steps instead of ten; and its card always docks in a strip above the time buttons, with the camera framing the scene above it. A third report, "the trajectory stays fixed", was a step that said "drag to plan" while steering was still locked. See [CO-003](change-orders/CO-003-onboarding-redesign.md) and [CO-004](change-orders/CO-004-trajectory-stays-fixed.md).

**Layout bugs are found by looking.** Every unit test passed while the docked card pushed the ship into the speed readout on a 950-pixel-wide screen. Playing each step at the reporters' screen sizes found it, and the feedback button covering the card on phones, within minutes.

## 2026-11-24: CO-005, Aim and Burn

The ship is now flown the way a real one is: ← → (or a sideways drag) turn the nose for free, and ↑ ↓ (or an up/down drag) fire the engine forward or in reverse. This replaced the original "push sideways only" control, which had been a deliberate simplification. The tutorial teaches aiming and burning on separate steps. See [CO-005](change-orders/CO-005-rotate-and-thrust.md).

**A good level outlives its controls.** The level's proof tests were written against the physics, not the input, so re-expressing the winning route in the new controls was a one-line change and the level stayed winnable without moving a world.

## Numbers

| Milestone | Tests | Specs |
|---|---|---|
| MVP | 21 | 73 |
| After the play-testing round | 24 | 89 |
| Beta | 42 | 97 |
| Tutorial | 59 | 113 |
| CO-001 | 82 | 126 |
| CO-002 | 108 | 156 |
| CO-003 | 112 | 160 |
| CO-005 | 116 | 164 |

Counted from the repository at each milestone's commit on `main`.

## What We Would Tell Ourselves at the Start

1. **Have someone else read the design with a calculator.** The unwinnable start was invisible in prose and obvious in a ten-line simulation.
2. **Review with a skeptic.** Findings that survived an attempt to refute them were all real; none of the fixes were wasted.
3. **Test the path, not the state.** A test that hand-builds the state it wants will pass over the bug in how that state is reached.
4. **Fast iteration needs a net.** Twenty quick changes left the docs behind. The fix is not to slow down but to make drift fail a check.
5. **Say what was skipped.** Every shortcut taken for a deadline was written down when it was taken, which is why each could be paid back.
