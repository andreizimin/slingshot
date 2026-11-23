# Flight Sim — EARS Specs

Design: `flight-sim-design.md` · Prefix: `SIM`

## Module boundary

- [x] **SIM-001**: The flight-sim modules in `site/sim/` shall use only relative imports with explicit `.js` extensions and shall not reference any browser global (`window`, `document`, canvas APIs), so the same files load in the browser and under `node --test`.

## Scenario and units

- [x] **SIM-SCN-001**: The flight sim shall express all distances in kilometres, all times in seconds, and all gravitational strengths as GM in km³/s², with `STAR_GM` = 1.32712e11, `PLANET_GM` = 1.26687e8, `PLANET_RADIUS` = 71,492 km, `ORBIT_RADIUS` = 7.785e8 km and `DT` = 30 s.
- [x] **SIM-SCN-002**: The flight sim shall place the star fixed at the origin and the planet at `(ORBIT_RADIUS·cos ωt, ORBIT_RADIUS·sin ωt)` at sim time `t`, where `ω = PLANET_SPEED / ORBIT_RADIUS` and `PLANET_SPEED = √(STAR_GM / ORBIT_RADIUS)`, with planet velocity equal to the exact time derivative of that position.
- [x] **SIM-SCN-003**: When `initialState()` is called, the flight sim shall return a ship at planet-relative position `(−4.0e6, 0)` km with planet-relative velocity `(√(V_INF² + 2·PLANET_GM / 4.0e6), 0)` km/s where `V_INF` = 10 km/s, added to the planet's star-frame position and velocity at `t = 0`.
- [x] **SIM-SCN-004**: When `initialState()` is called, the flight sim shall set `t` = 0, `steps` = 0, `fuel` = `FUEL_DV` (5.0 km/s), `status` = `'flying'`, `closest` = the starting ship-to-planet distance, `startSpeed` = the starting star-frame speed, and `grav` = the gravitational acceleration at the starting position and `t = 0`.

## Stepping

- [x] **SIM-STEP-001**: When `step(state, thrustDir)` is called on a `'flying'` state, the flight sim shall advance the ship by exactly one `DT` using velocity Verlet with thrust held constant across the step: position by `vel·DT + ½(grav + T)·DT²`, velocity by `½(grav + gravNew)·DT + T·DT`, with `grav` storing gravity only (never thrust).
- [x] **SIM-STEP-002**: The flight sim's gravity function shall return the sum of inverse-square accelerations toward the star at the origin and toward the planet at its prescribed position for the given time, using only GM values and centre positions (never any drawn size).
- [x] **SIM-STEP-003**: The flight sim's `step` shall return a new state object and shall not modify the state passed in.
- [x] **SIM-STEP-004**: When `step` is called on a state whose `status` is `'crashed'` or `'departed'`, the flight sim shall return a state equal to the input, spending no fuel and advancing no time.
- [x] **SIM-STEP-005**: After each step, the flight sim shall update `closest` to the smaller of its previous value and the current ship-to-planet distance.

## Thrust and fuel

- [x] **SIM-FUEL-001**: When `step` is called with `thrustDir` `'up'`, `'down'`, `'left'` or `'right'` and fuel remains, the flight sim shall apply a thrust acceleration of `THRUST_ACCEL` (5e-5 km/s²) along world `+y`, `−y`, `−x` or `+x` respectively, and reduce `fuel` by `THRUST_ACCEL·DT`.
- [x] **SIM-FUEL-002**: If a thrust step would spend more fuel than remains, then the flight sim shall scale that step's thrust so that exactly the remaining fuel is spent and `fuel` becomes exactly 0.
- [x] **SIM-FUEL-003**: While `fuel` is 0, the flight sim shall apply no thrust regardless of `thrustDir`.
- [x] **SIM-FUEL-004**: If `thrustDir` is any value other than `'up'`, `'down'`, `'left'` or `'right'`, then the flight sim shall treat it as no thrust.

- [x] **SIM-FUEL-005**: When `planningBurn(state, thrustDir, dv)` is called on a `'flying'` state with a valid direction, the flight sim shall add `min(dv, fuel)` km/s to the velocity along that world axis, reduce `fuel` by the same amount, and leave `pos`, `t`, `steps` and `grav` unchanged; otherwise it shall return the state unchanged.

## Crash and departure

- [x] **SIM-END-001**: When a step leaves the ship less than `PLANET_RADIUS` from the planet centre, the flight sim shall set `status` to `'crashed'`.
- [x] **SIM-END-002**: When a step leaves a non-crashed ship farther than `START_DISTANCE` (4.0e6 km) from the planet while `closest` is less than half of `START_DISTANCE`, the flight sim shall set `status` to `'departed'`.
- [x] **SIM-END-003**: When the ship coasts from `initialState()` with no thrust, the flight sim shall reach `status` `'crashed'`.

## Time control

- [x] **SIM-TIME-001**: The flight sim shall define time settings as steps per real second: paused 0, slow 120, normal 480, fast 1920, with `DT` unchanged in every setting.
- [x] **SIM-TIME-002**: When `stepsForFrame(setting, elapsedSeconds, carry)` is called, the flight sim shall return the whole number of steps `floor(rate·elapsed + carry)` for that setting and the fractional remainder as the new `carry`.
- [x] **SIM-TIME-003**: If `stepsForFrame` receives `elapsedSeconds` greater than 0.25, then the flight sim shall compute steps as if 0.25 seconds had elapsed.
- [x] **SIM-TIME-004**: When `advance(state, n, thrustDir)` is called, the flight sim shall apply `step` `n` times with the same `thrustDir` and return the final state plus `samples`: the ship's planet-relative position after every step whose resulting `steps` count is a multiple of 10.
- [x] **SIM-TIME-005**: The flight sim shall produce an identical state from the same starting state and the same per-step thrust sequence regardless of how the steps are grouped into `advance` calls.

## Prediction

- [x] **SIM-PRED-001**: When `predict(state, maxSteps)` is called, the flight sim shall run the same step arithmetic as `step` from a copy of `state` with no thrust, for up to `maxSteps` (default 20,000) steps, without modifying `state`.
- [x] **SIM-PRED-002**: When `predict` runs, the flight sim shall record every 20th step as a point holding the ship's star-frame position and the planet's star-frame position at that step's time.
- [x] **SIM-PRED-003**: If the predicted copy's status becomes `'crashed'` or `'departed'`, then the flight sim shall stop the prediction at that step and report which ending occurred (`'crashed'`, `'departed'`, or `'horizon'` when `maxSteps` ran out).
- [x] **SIM-PRED-004**: When no thrust is applied, the flight sim's live state after `20·k` further steps shall have the same position as the prediction's `k`-th point made from the starting state.

## Readouts

- [x] **SIM-READ-001**: The flight sim shall provide `starFrameSpeed(state)` = `|vel|`, `planetFrameVelocity(state)` = `vel − planet velocity at t`, `planetRelativePosition(state)` = `pos − planet position at t`, and `speedChange(state)` = `starFrameSpeed(state) − startSpeed`.

## Physical acceptance

- [x] **SIM-ACC-001**: For a coasting flyby that clears the planet surface, the planet-frame speed at the first step inside 2.5e6 km of the planet and at the first step back outside 2.5e6 km shall agree within 0.1%.
- [x] **SIM-ACC-002**: When the ship burns half of `FUEL_DV` toward `−y` (behind the planet) from `initialState()` and then coasts to `'departed'`, the flight sim shall report a star-frame speed greater than `startSpeed`.
- [x] **SIM-ACC-003**: When the ship burns half of `FUEL_DV` toward `+y` (in front of the planet) from `initialState()` and then coasts to `'departed'`, the flight sim shall report a star-frame speed less than `startSpeed`.
