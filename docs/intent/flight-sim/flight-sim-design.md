---
parent: high-level-design
prefix: SIM
---

# Flight Sim

## Context and Design Philosophy

The flight sim is the physics of Slingshot: a star, one planet on a circular orbit, and a ship that feels the gravity of both. It is a set of pure JavaScript ES modules in `site/sim/` with no DOM access, importable from both the browser and Node, so every physical claim the game makes can be checked by a unit test.

Two rules shape everything here. The numbers are real-world-range (real masses, kilometres, km/s), and the integrator is honest: fixed step, symplectic, never stretched. Anything that makes a flyby easier to read is the cockpit's job, not the sim's.

Modules in `site/sim/` use only relative imports with explicit `.js` extensions and touch no browser globals, so the same files load unchanged in the browser and under `node --test`.

## Units and Scenario

All quantities use **kilometres, seconds, and gravitational parameters (GM) in km³/s²**. Masses never appear directly; only GM does.

The first-slice scenario is a Sun-like star with a Jupiter-like planet, because Jupiter is the one body in the reference table heavy and fast enough to give a dramatic assist.

| Constant | Value | Meaning |
|---|---|---|
| `STAR_GM` | 1.32712e11 km³/s² | Sun |
| `PLANET_GM` | 1.26687e8 km³/s² | Jupiter |
| `PLANET_RADIUS` | 71,492 km | Jupiter equatorial radius; used only for collision |
| `ORBIT_RADIUS` | 7.785e8 km | Jupiter's mean distance from the Sun |
| `PLANET_SPEED` | √(STAR_GM / ORBIT_RADIUS) ≈ 13.06 km/s | derived, not hand-set |
| `DT` | 30 s | fixed physics step |

The star sits fixed at the origin. The planet's position is prescribed: at sim time `t` it is at angle `θ(t) = ω·t` on a circle of radius `ORBIT_RADIUS`, with `ω = PLANET_SPEED / ORBIT_RADIUS`, moving counter-clockwise. At `t = 0` the planet is at `(ORBIT_RADIUS, 0)` moving in `+y`. Its velocity is the exact derivative of that path.

### Initial ship state

The ship starts sunward of the planet, aimed straight at it, so the player must choose a side:

- `START_DISTANCE` = 4.0e6 km. Position relative to the planet: `(−START_DISTANCE, 0)`.
- `V_INF` = 10 km/s: the ship's speed relative to the planet *far from it* (its hyperbolic excess speed). The starting relative speed is the speed that energy conservation gives at `START_DISTANCE`: `√(V_INF² + 2·PLANET_GM / START_DISTANCE)` ≈ 12.6 km/s, directed `+x`.
- Star-frame state is the planet's state plus these offsets. The starting star-frame speed is about 18.3 km/s.

Coasting from this start is a collision: Jupiter's gravity focuses every approach with an offset under about six planet radii onto its surface. Pushing toward `−y` sends the ship across behind the planet (opposite its motion), which bends the planet-frame velocity toward `+y` and raises the star-frame speed: a **boost**. Pushing toward `+y` passes in front: a **brake**.

The initial values are tunable scenario constants. Changing them is a scenario choice, not a physics change.

### Fuel and thrust

- `THRUST_ACCEL` = 5e-5 km/s², applied in one of four world-axis directions while held.
- `FUEL_DV` = 5.0 km/s total delta-v budget.

Fuel is a delta-v budget: each step with thrust on spends `THRUST_ACCEL · DT` of it. If a step would spend more than remains, its thrust is scaled down to use exactly what is left, and fuel is then exactly zero. Thrust has no effect when fuel is zero.

### Planning burns

`planningBurn(state, thrustDir, dv)` applies an **instantaneous** velocity change of up to `dv` km/s along one world axis without advancing time. It spends exactly the delta-v it applies, capped at the fuel remaining, so fuel means the same thing whether a burn happens while flying or while time is frozen. Position, `t`, `steps` and `grav` are unchanged (gravity depends only on position and time). It has no effect unless `status` is `'flying'` and `thrustDir` is one of the four directions. This is what lets the player nudge the approach while paused and watch the prediction respond.

With these values, burning about 30% of the fuel early gives a close pass (under two planet radii) worth roughly +6.6 km/s behind or −10.8 km/s in front; burning more gives wider, gentler passes. Fuel spent buys safety; fuel saved buys drama.

## State and Stepping

The sim state is a plain object:

```js
{ t, steps, pos: {x, y}, vel: {x, y}, grav: {x, y}, fuel, status, closest, startSpeed }
// status: 'flying' | 'crashed' | 'departed'
```

- `grav` is the gravitational acceleration at `pos` and `t`, **excluding thrust**. `initialState()` sets it to `gravity(pos, 0)`.
- `steps` counts steps taken since the start.
- `closest` is the smallest ship-to-planet distance seen so far.
- `startSpeed` is the star-frame speed at `t = 0`.

`step(state, thrustDir)` advances by exactly one `DT` using **velocity Verlet**, with thrust `T` held constant across the step:

1. `pos += vel·DT + ½·(grav + T)·DT²`
2. `t += DT`, `steps += 1`
3. `gravNew = gravity(pos, t)`
4. `vel += ½·(grav + gravNew)·DT + T·DT`
5. `grav = gravNew`

`gravity(pos, t)` sums the inverse-square pull of the star at the origin and of the planet at its prescribed position at time `t`. The planet feels no gravity; it follows its circle.

`thrustDir` is one of `null`, `'up'` (+y), `'down'` (−y), `'left'` (−x), `'right'` (+x). Any other value is treated as `null`.

After each step:

- If the ship is within `PLANET_RADIUS` of the planet centre, `status` becomes `'crashed'`.
- Otherwise, if the ship has passed closest approach (`closest` is under half of `START_DISTANCE`) and is now farther than `START_DISTANCE` from the planet, `status` becomes `'departed'`. The flyby is over.

When `status` is not `'flying'`, `step` returns the state unchanged and spends no fuel.

`step` returns a new state and does not mutate its input. Internally, prediction and multi-step advance use an in-place variant of the same arithmetic for speed; the two must produce identical numbers.

## Time Control

Time settings are measured in **steps per real second**, not per rendered frame, so the game runs at the same pace on 60 Hz and 120 Hz displays:

| Setting | Steps per real second | Sim time per real second |
|---|---|---|
| paused | 0 | 0 |
| slow | 120 | 1 hour |
| normal | 480 | 4 hours |
| fast | 1920 | 16 hours |

`stepsForFrame(setting, elapsedSeconds, carry)` returns `{ steps, carry }`. It converts the real time since the last frame into a whole number of steps and carries the fractional remainder to the next frame. Elapsed time above 0.25 s (a background tab, a stall) is clamped to 0.25 s, so the game never jumps ahead after being hidden.

`advance(state, steps, thrustDir)` runs `step` that many times and returns `{ state, samples }`, where `samples` holds the ship's planet-relative position at every step whose global `steps` count is a multiple of 10 (every 5 sim minutes). The cockpit draws its trail from these samples.

`DT` is identical in every setting. A trajectory depends only on the total number of steps and the thrust applied at each, never on how the steps were grouped into frames.

At Normal, coasting to closest approach from the start takes about 35 real seconds, and spending all the fuel takes about 7 seconds of holding an arrow.

## Prediction Line

`predict(state, maxSteps = 20000)` runs the same step arithmetic from a copy of the state with **no thrust**, for up to `maxSteps` (about 7 sim days, enough to cover a full flyby from the start), recording every 20th step. It stops early if the copy crashes or departs. Each recorded point carries the ship's position and the planet's position at that same time, and the result reports whether it ended in a crash.

The prediction shows the coasting path from the current state. While the player is burning, it updates every frame to show where the ship will go if they stop now.

Because thrust is not stored in the state, a prediction made from any state matches the live trajectory step for step as long as no further thrust is applied.

## Frames and Readouts

- `starFrameSpeed(state)`: `|vel|`. This is the speed the player sees.
- `planetFrameVelocity(state)`: `vel − planetVelocity(t)`.
- `planetRelativePosition(state)`: `pos − planetPosition(t)`.
- `speedChange(state)`: `starFrameSpeed(state) − startSpeed`.

## Physical Acceptance Tests

These define "the physics works" for this slice:

1. **Flyby speed conservation.** A test builds a coasting state with no thrust, `START_DISTANCE` from the planet with a sideways offset that clears the surface. At the first step inside 2.5e6 km of the planet and the first step back outside it, the planet-frame speeds agree within 0.1%. The star's tide contributes about 0.004%, so a failure means the integrator or the frames are wrong.
2. **Boost behind, brake in front.** From the default start, burning half the fuel from `t = 0` toward `−y` and then coasting to `'departed'` ends with a star-frame speed above `startSpeed`. The same burn toward `+y` ends below it.
3. **Time-setting invariance.** Advancing the same total number of steps grouped as fast frames versus slow frames gives an identical state.
4. **Prediction fidelity.** With no thrust, the live state after `n·20` steps matches the prediction's `n`-th point.
5. **Default start crashes.** Coasting from the default start with no thrust ends in `'crashed'`.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Integrator | Velocity Verlet, fixed `DT` | Euler; RK4; adaptive step | Symplectic, so flyby speed in the planet frame is conserved and orbits don't spiral. Euler gains energy. RK4 drifts over long runs. An adaptive step would break the guarantee that time settings and prediction follow the same trajectory. |
| `DT` value | 30 s | 1 s; 300 s | At a near-grazing pass (about 60 km/s) one step moves about 2.5% of a planet radius, keeping the per-flyby error far below the 0.1% test tolerance. Smaller steps make fast-forward expensive; larger steps fail close passes. |
| Thrust in state | Not stored; gravity-only `grav` field | Store total acceleration | A stored total acceleration carries half a step of thrust into the next step and into any prediction, breaking exact prediction. |
| Planet motion | Prescribed circular orbit | Integrate the planet under the star's gravity | It can't drift, its velocity is exact, and the scenario is reproducible. |
| Units | km, s, GM in km³/s² | SI metres and kg; game units | Real values at readable magnitudes. Game units would invite quietly unphysical numbers. |
| Scenario | Sun + Jupiter, ship 4e6 km out, 10 km/s hyperbolic excess speed | 3e6 km at 10 km/s *local* speed; Earth or Venus | Specifying the far-field speed matches the brief's "arriving at 10 km/s" and keeps a strong assist. A start at 3e6 km with 10 km/s local speed leaves only about 4 km/s far-field, and the planet captures nearly every approach. |
| Thrust and fuel | 5e-5 km/s², 5 km/s budget | 2e-5 km/s² with 2 km/s | Simulated: the smaller budget crashes unless the player burns everything at once. The chosen values give a real choice of side and distance, with a 7-second full burn at Normal. |
| Time control unit | Steps per real second with a fractional carry and 0.25 s clamp | Steps per animation frame | Per-frame stepping runs twice as fast on 120 Hz displays and leaps after a background tab. |
| End of flyby | `'departed'` status once back beyond `START_DISTANCE` after closest approach | Run forever | Gives the cockpit a moment to show the result and gives test 2 a defined measurement point. |
| Burning while paused | Instantaneous delta-v (`planningBurn`) | Run hidden sim time while paused; disallow | An impulse is physically honest, spends the same fuel per km/s, and keeps "paused" meaning frozen time. |
| Crash | Status flag at physical radius; sim freezes | Bounce; pass through | Honest and simple. The visual radius is never used. |
| Thrust directions | Four world axes | Rotate-and-thrust | No ship orientation to learn; maps onto arrow keys. |

## Open Questions & Future Decisions

### Resolved
1. ✅ The star is fixed at the origin and unaffected by the planet. The planet-to-star mass ratio (about 1/1000) makes its wobble irrelevant for this slice.

### Deferred
1. Multiple planets and drifting systems.
2. Whether fuel should be shown and tuned as delta-v or as an abstract "fuel" unit for kids.

## References

- `docs/high-level-design.md`
- `docs/slingshot-context.md` (physics ground rules, reference numbers)
