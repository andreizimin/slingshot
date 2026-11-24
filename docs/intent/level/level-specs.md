# Level — EARS Specs

Design: `level-design.md` · Prefix: `LEVEL`

Specs whose behaviour lives in the pure `site/sim/levels.js` and `site/cockpit/level.js` are covered by `tests/level.test.js`. The rest are listed under **Verified by hand** at the end.

## The pond

- [x] **LEVEL-001**: The level scenario shall have no star and three drifting worlds, each with GM 1.26687e8 km³/s² and radius 71,492 km: Home starting at (0, 0) drifting (0, 13) km/s, Racer starting at (−9.776e6, 14.385e6) km drifting (14, 0) km/s, and Haven starting at (3.344e6, 9.463e6) km drifting (−7.023, 14.733) km/s; with Haven as the destination, a catch radius of 3.0e6 km and a catch speed of 5 km/s (both judged against Haven's centre and the far speed relative to Haven, per `SIM-END-004`), a lost distance of 3.0e7 km from each world's current centre (per `SIM-END-005`), a fuel budget of 10 km/s and a prediction horizon of 40,000 steps.
- [x] **LEVEL-002**: The level scenario shall start the ship at Home's position plus (−4.0e6, 0) km, moving straight at Home: with velocity equal to Home's drift plus (`√(10² + 2·GM_Home / 4.0e6)`, 0) km/s, about (12.6, 13.0) km/s.
- [x] **LEVEL-003**: When a level flight ends `'arrived'`, the level shall award 3 stars when the fuel left is at least 6 km/s, 2 stars when it is at least 3 km/s, and 1 star otherwise, each comparison allowing 1e-9 km/s of rounding; when it ends `'crashed'` or `'lost'`, 0 stars.

## Proving the level

- [x] **LEVEL-004**: When the ship flies the level from its start with a 3 km/s `'down'` manoeuvre queued with `planningBurn` at `t = 0` (sideways relative to Home, per `SIM-FUEL-006`, and flown by the real step with turning and spool-up) and then steps with no direction held until the flight ends or 100,000 steps pass, the flight shall end `'arrived'` with at least 6 km/s of fuel left.
- [x] **LEVEL-005**: The magnitude of the vector difference between Haven's drift and the ship's starting velocity shall exceed the fuel budget plus the catch speed.
- [x] **LEVEL-006**: At least two first pushes whose sizes differ by at least 1 km/s, each a `'down'` manoeuvre queued at `t = 0` and each followed by one queued correction at a time and size the test chooses, shall end the flight `'arrived'`.

## Flow and score

- [x] **LEVEL-007**: When the level starts or restarts, the cockpit shall pause in the ready state and show the ready card "Fly to Haven" with "You can't get there on fuel alone: chain slingshots, and arrive slowly enough to be caught."
- [x] **LEVEL-008**: When a level flight ends, the cockpit shall show a result card: for `'arrived'`, the stars, the fuel left as a percentage of the budget rounded to the nearest whole number, and a Fly again button; for `'crashed'`, "Bonk! You hit <name of the world hit>" and a Try again button; for `'lost'`, "Lost in space" and a Try again button.
- [x] **LEVEL-009**: When the player presses R at any time during the level (mid-flight, paused, or on a result card), or the result card's button, the cockpit shall set up a fresh level flight: full fuel, no queued manoeuvre, the trail cleared, paused on the ready card, and the camera centre and scale snapped (not eased) to Home; an abandoned flight sends no level end event.
- [x] **LEVEL-010**: When the tutorial ends (I'm ready or Skip tour), the cockpit shall start the level.
- [x] **LEVEL-011**: While the level is playing, R or the result card's button shall restart the level from its start; the ? button shall start the tutorial from step 1.
- [x] **LEVEL-012**: When the player first starts play from a level flight's ready card, the cockpit shall send `slingshot_level_start`; when a level flight ends (arrived, crashed or lost), it shall send `slingshot_level_end` exactly once, with `outcome`, `fuel_left` (percentage of the budget rounded to the nearest whole number) and `stars` (0–3).

## Verified by hand

The cards and the restart wiring live in `site/cockpit/main.js`. On the dev site, on a desktop and a phone: finish the level, crash it, and get lost, checking each card; press R mid-flight and from a result; press ? from the level.

- `LEVEL-007`, `LEVEL-009`, `LEVEL-010`, `LEVEL-011`
