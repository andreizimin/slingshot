# Flight Sim — EARS Specs

Design: `flight-sim-design.md` · Prefix: `SIM`

All distances in these specs are between the ship's position and a world's centre.

## Module boundary

- [x] **SIM-001**: The flight-sim modules in `site/sim/` shall use only relative imports with explicit `.js` extensions and shall not reference any browser global (`window`, `document`, canvas APIs), so the same files load in the browser and under `node --test`.

## Scenarios and units

- [x] **SIM-SCN-001**: The flight sim shall express all distances in kilometres, all times in seconds, and all gravitational strengths as GM in km³/s², with `STAR_GM` = 1.32712e11, `PLANET_GM` = 1.26687e8, `PLANET_RADIUS` = 71,492 km, `ORBIT_RADIUS` = 7.785e8 km and `DT` = 30 s.
- [x] **SIM-SCN-002**: In the tutorial scenario, the flight sim shall place the star fixed at the origin and the planet at `(ORBIT_RADIUS·cos ωt, ORBIT_RADIUS·sin ωt)` at sim time `t`, where `ω = PLANET_SPEED / ORBIT_RADIUS` and `PLANET_SPEED = √(STAR_GM / ORBIT_RADIUS)`, with planet velocity equal to the exact time derivative of that position.
- [x] **SIM-SCN-003**: When `initialState()` is called with no scenario or with the tutorial scenario, the flight sim shall return a ship at planet-relative position `(−4.0e6, 0)` km with planet-relative velocity `(√(V_INF² + 2·PLANET_GM / 4.0e6), 0)` km/s where `V_INF` = 10 km/s, added to the planet's star-frame position and velocity at `t = 0`.
- [x] **SIM-SCN-004**: When `initialState()` is called with no scenario or with the tutorial scenario, the flight sim shall set `t` = 0, `steps` = 0, `fuel` = `FUEL_DV` (10.0 km/s), `status` = `'flying'`, `closest` = the starting ship-to-planet distance, `startSpeed` = the starting star-frame speed, and `grav` = the gravitational acceleration at the starting position and `t = 0`.
- [x] **SIM-SCN-005**: The flight sim shall accept a scenario as data: an optional star GM at the origin; one or more worlds, each with a name, GM, radius and either an orbit around the star (radius and speed) or a drift (start position and constant velocity); the ship's starting position and velocity; a fuel budget; a prediction horizon in steps; and an end rule, `flyby` (with its start distance) or `level` (with a destination world index other than 0, a catch radius larger than that world's radius, a catch speed and a lost distance).
- [x] **SIM-SCN-006**: When `initialState(scenario)` is called, the flight sim shall take the ship's position, velocity and fuel from the scenario, set the focus to the world nearest the ship, set `closest` to the distance to world 0, set `startSpeed` to the starting speed in the scenario's frame, and attach the scenario to the state without copying it.
- [x] **SIM-SCN-007**: For a drifting world, the flight sim shall place it at its start position plus its velocity times `t`, with that constant velocity as its velocity.

## Stepping

- [x] **SIM-STEP-001**: When `step(state, thrustDir)` is called on a `'flying'` state, the flight sim shall advance the ship by exactly one `DT` using velocity Verlet with thrust held constant across the step: position by `vel·DT + ½(grav + T)·DT²`, velocity by `½(grav + gravNew)·DT + T·DT`, with `grav` storing gravity only (never thrust).
- [x] **SIM-STEP-002**: The flight sim's gravity function shall return the sum of inverse-square accelerations toward the scenario's star at the origin (when it has one) and toward every world at its prescribed position for the given time, using only GM values and centre positions (never any drawn size).
- [x] **SIM-STEP-003**: The flight sim's `step` shall return a new state object and shall not modify the state passed in.
- [x] **SIM-STEP-004**: When `step` is called on a state whose `status` is anything other than `'flying'` (`'crashed'`, `'departed'`, `'arrived'` or `'lost'`), the flight sim shall return a state equal to the input, spending no fuel and advancing no time.
- [x] **SIM-STEP-005**: After each step, the flight sim shall update `closest` to the smaller of its previous value and the current distance from the ship to world 0.
- [x] **SIM-STEP-006**: After each step, using distances at the ship's new position and the new time, the flight sim shall change `focus` to another world only if that world is nearer than 0.9 times the distance to the current focus world, choosing the nearest such world; otherwise `focus` shall stay unchanged.

## Thrust and fuel

- [x] **SIM-FUEL-001**: While the engine is firing, the flight sim shall apply a thrust acceleration of `throttle · THRUST_ACCEL` (5e-5 km/s² at full throttle) along the ship's heading and reduce `fuel` by the delta-v delivered that step.
- [x] **SIM-FUEL-002**: If a thrust step would spend more fuel than remains, then the flight sim shall scale that step's thrust so that exactly the remaining fuel is spent and `fuel` becomes exactly 0.
- [x] **SIM-FUEL-003**: While `fuel` is 0, the flight sim shall apply no thrust regardless of the input.
- [x] **SIM-FUEL-004**: The flight sim shall take each step's input as a command `{ rotate, thrust }` with `rotate` in {−1, 0, +1} (+1 counter-clockwise) and `thrust` in {−1, 0, +1} (+1 forward along the heading, −1 reverse); any other value of either field, or a `null` input, shall count as 0.
- [x] **SIM-FUEL-005**: When `planningBurn(state, dv)` is called on a `'flying'` state, the flight sim shall add the signed `dv` to the queued burn `planBurn` (+ forward, − reverse), clamped to ±`fuel`, without changing velocity, position, time, aim or fuel; on any other state it shall return the state unchanged. Opposite calls cancel.
- [x] **SIM-FUEL-006**: In each step, the flight sim shall first turn `aim` by `rotate · TURN_RATE`, then turn `heading` toward `aim` by at most `TURN_RATE`; while thrust is wanted (held, or a queued burn) it shall fire only once the heading is within `ALIGN_TOLERANCE` (10°) of the aim, raise throttle by `1/SPOOL_STEPS` per firing step up to 1, push along the heading (forward) or against it (reverse), and set throttle to 0 whenever no thrust is wanted or the nose is not aligned.
- [x] **SIM-FUEL-007**: While no thrust is held and `planBurn` is non-zero, the flight sim shall fly the queued burn in its sign's direction (forward or reverse), spending no more than `|planBurn|` in total, and cut the engine when it is delivered or fuel runs out.
- [x] **SIM-FUEL-008**: When `planAim(state, dAngle)` is called on a `'flying'` state, the flight sim shall turn both `aim` and `heading` by `dAngle` radians, without changing velocity, position, time, `planBurn` or fuel; on any other state it shall return the state unchanged.
- [x] **SIM-FUEL-009**: The flight sim shall never spend fuel on turning: a step with `rotate` ≠ 0 and no thrust, or a heading turning toward the aim, shall leave `fuel` unchanged.
- [x] **SIM-FUEL-010**: When `initialState` is called, the flight sim shall set `heading` and `aim` to the direction from the ship toward world 0, `throttle` to 0 and `planBurn` to 0.

## Ending a flight

- [x] **SIM-END-001**: When a step ends with the ship less than a world's radius from that world's centre, for any world in the scenario, the flight sim shall set `status` to `'crashed'`.
- [x] **SIM-END-002**: Under the `flyby` end rule, when a step leaves a non-crashed ship farther than the scenario's start distance (4.0e6 km in the tutorial) from world 0 while `closest` is less than half of that distance, the flight sim shall set `status` to `'departed'`.
- [x] **SIM-END-003**: When the ship coasts from `initialState()` with no thrust, the flight sim shall reach `status` `'crashed'`.
- [x] **SIM-END-004**: Under the `level` end rule, when a step leaves a non-crashed ship at a distance from the destination world's centre strictly less than the catch radius, with a far speed relative to that world strictly less than the catch speed, the flight sim shall set `status` to `'arrived'`.
- [x] **SIM-END-005**: Under the `level` end rule, when a step leaves a ship that is neither crashed nor arrived strictly farther than the lost distance from the centre of every world, the flight sim shall set `status` to `'lost'`.
- [x] **SIM-END-006**: After every step, once `closest` and `focus` are updated, the flight sim shall evaluate only the scenario's own end rule, in this order, and the first condition that holds shall decide the status: under `flyby`, crashed then departed; under `level`, crashed then arrived then lost.

## Time control

- [x] **SIM-TIME-001**: The flight sim shall define time settings as steps per real second: paused 0, slow 200, normal 800, fast 3300, with `DT` unchanged in every setting.
- [x] **SIM-TIME-002**: When `stepsForFrame(setting, elapsedSeconds, carry)` is called, the flight sim shall return the whole number of steps `floor(rate·elapsed + carry)` for that setting and the fractional remainder as the new `carry`.
- [x] **SIM-TIME-003**: If `stepsForFrame` receives `elapsedSeconds` greater than 0.25, then the flight sim shall compute steps as if 0.25 seconds had elapsed.
- [x] **SIM-TIME-004**: When `advance(state, n, thrustDir)` is called, the flight sim shall apply `step` `n` times with the same `thrustDir`, stopping early once the flight ends, and return the final state plus `samples`: the ship's position and the time after every step whose resulting `steps` count is a multiple of 10, and after the step that ends the flight.
- [x] **SIM-TIME-005**: The flight sim shall produce an identical state from the same starting state and the same per-step thrust sequence regardless of how the steps are grouped into `advance` calls.

## Prediction

- [x] **SIM-PRED-001**: When `predict(state, maxSteps)` is called, the flight sim shall run the same step arithmetic as `step` from a copy of `state` with no direction held (a queued manoeuvre is still flown), for up to `maxSteps` steps (by default the scenario's prediction horizon: 20,000 in the tutorial, 40,000 in the level), without modifying `state`.
- [x] **SIM-PRED-002**: When `predict` runs, the flight sim shall record a point holding the ship's position and the time after the 20th, 40th, … step counted from the start of the prediction (the starting position is not a point), and after the step at which the predicted flight ends.
- [x] **SIM-PRED-003**: If the predicted copy's flight ends, then the flight sim shall stop the prediction at that step and report which ending occurred (`'crashed'`, `'departed'`, `'arrived'`, `'lost'`, or `'horizon'` when `maxSteps` ran out).
- [x] **SIM-PRED-004**: When no thrust is applied, the flight sim's live state after `20·k` further steps shall have the same position as the prediction's `k`-th point made from the starting state.

## Readouts

- [x] **SIM-READ-001**: The flight sim shall provide `starFrameSpeed(state)` = `|vel|` in the scenario's frame, `planetFrameVelocity(state)` = `vel` minus the focus world's velocity, `planetRelativePosition(state)` = `pos` minus the focus world's position, and `speedChange(state)` = `starFrameSpeed(state) − startSpeed`.
- [x] **SIM-READ-002**: The flight sim shall provide `axes(state)` (unit vectors toward the focus world and sideways) and `speedComponents(state)` (the velocity relative to the focus world split along them).
- [x] **SIM-READ-003**: The flight sim shall provide `farSpeed(state, i)` = `√(max(0, v² − 2·GM/d))`, with `v` the ship's speed relative to world `i` and `d` its distance from that world's centre, which is 0 when the ship is bound to that world.
- [x] **SIM-READ-004**: The flight sim shall provide `focusWorld(state)` (the focus world's index), `worldPosition(scenario, i, t)` and `worldVelocity(scenario, i, t)`.

## Physical acceptance

- [x] **SIM-ACC-001**: For a coasting flyby that clears the planet surface, the planet-frame speed at the first step inside 2.5e6 km of the planet and at the first step back outside 2.5e6 km shall agree within 0.1%.
- [x] **SIM-ACC-002**: When the ship burns half of `FUEL_DV` toward `−y` (behind the planet) from `initialState()` and then coasts to `'departed'`, the flight sim shall report a star-frame speed greater than `startSpeed`.
- [x] **SIM-ACC-003**: When the ship burns half of `FUEL_DV` toward `+y` (in front of the planet) from `initialState()` and then coasts to `'departed'`, the flight sim shall report a star-frame speed less than `startSpeed`.
- [x] **SIM-ACC-004**: In a scenario with one drifting world and no star, for a coasting flyby that clears the world's surface, the speed relative to that world at the first step inside 2.5e6 km of it and at the first step back outside shall agree within 0.1%.
- [x] **SIM-ACC-005**: `initialState()` and `initialState(tutorial scenario)` shall produce identical states, and stepping either shall produce identical trajectories.
