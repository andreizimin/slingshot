---
parent: high-level-design
prefix: SIM
---

# Flight Sim

## Context and Design Philosophy

The flight sim is the physics of Slingshot: a ship that feels the real gravity of every body in a **scenario**. The tutorial's scenario is a star with one planet on a circular orbit; the level's is a pond of worlds drifting at constant velocities, with no star. It is a set of pure JavaScript ES modules in `site/sim/` with no DOM access, importable from both the browser and Node, so every physical claim the game makes can be checked by a unit test.

Two rules shape everything here. The numbers are real-world-range (real masses, kilometres, km/s), and the integrator is honest: fixed step, symplectic, never stretched. Anything that makes a flyby easier to read is the cockpit's job, not the sim's.

Modules in `site/sim/` use only relative imports with explicit `.js` extensions and touch no browser globals, so the same files load unchanged in the browser and under `node --test`.

## Units and Scenarios

All quantities use **kilometres, seconds, and gravitational parameters (GM) in km³/s²**. Masses never appear directly; only GM does.

### Scenarios and worlds

A **scenario** is plain data: an optional fixed star, a list of **worlds** (at least one), the ship's starting state, the fuel budget, the prediction horizon, and its **end rule** with that rule's parameters. A `level` scenario also names its destination world (never its first world), its catch radius (larger than the destination's radius), its catch speed and its lost distance; the `level` node owns their values. `initialState(scenario)` takes the ship's start and the fuel budget from the scenario. The scenario's frame is the star's when it has one, and otherwise the **pond frame**, the fixed frame the worlds drift in. Each world has a name, a GM, a radius (for collisions only) and a prescribed motion:

- **orbit**: a circle around the star at a given radius and speed (the tutorial's planet);
- **drift**: a constant velocity across the pond from a starting position (the level's worlds).

Worlds feel no gravity; they follow their prescribed motion exactly, which keeps every scenario reproducible. The ship feels the inverse-square pull of the star (if any) and of **every** world at once: there is no switching between "spheres of influence", so a flyby next to one world is still pulled, very slightly, by the others.

The **focus world** is the world the ship's speed arrows and the camera are measured against. It starts as the world nearest the ship, and after each step it changes only when another world is at least 10% nearer than the current focus, so halfway between two worlds it does not flip back and forth. The state carries it (`focus`). Everything the player steers by is measured relative to it: the sideways axis, the two speed components, the planet-relative position and velocity. In the tutorial there is one world, so it is always the focus. In this document "the planet" means the focus world wherever a scenario has more than one.

The **end rule** decides how a flight ends besides crashing:

- `flyby` (tutorial): the flight is over once the ship has passed closest approach to the world (closer than half the start distance) and is back beyond the start distance; status `'departed'`.
- `level`: the flight is over when the ship is **caught** by the destination world, status `'arrived'`, or is farther than the lost distance from every world's centre (strictly), status `'lost'`. The worlds drift apart over time; the level's lost distance is chosen well beyond any gap between them during play.

The checks run after every step, in this order, and the first that holds decides the status: **crashed** (within any world's radius), then **arrived**, then **lost** (or **departed** under the flyby rule).

**Caught** means: within the destination's catch radius, with a **far speed** relative to the destination under the catch speed. The far speed is the speed the ship would have relative to that world if it climbed out of its gravity: `√(max(0, v² − 2·GM/d))`, with `v` the speed relative to the world and `d` the distance. Unlike the plain relative speed it does not grow as the ship falls in, so "slow enough" means the same thing at any distance. It counts only the destination's own pull; when the ship is bound to the destination (`v² < 2·GM/d`) it is 0. The test is instantaneous: the first step at which both hold ends the flight. The thrust is gentle and only sideways, so the ship cannot brake hard on arrival: arriving slowly takes a braking flyby (passing in front of a world) earlier on.

### The tutorial scenario

The tutorial's scenario is a Sun-like star with a Jupiter-like planet, because Jupiter is the one body in the reference table heavy and fast enough to give a dramatic assist.

| Constant | Value | Meaning |
|---|---|---|
| `STAR_GM` | 1.32712e11 km³/s² | Sun |
| `PLANET_GM` | 1.26687e8 km³/s² | Jupiter |
| `PLANET_RADIUS` | 71,492 km | Jupiter equatorial radius; used only for collision |
| `ORBIT_RADIUS` | 7.785e8 km | Jupiter's mean distance from the Sun |
| `PLANET_SPEED` | √(STAR_GM / ORBIT_RADIUS) ≈ 13.06 km/s | derived, not hand-set |
| `DT` | 30 s | fixed physics step |

The star sits fixed at the origin. The planet's position is prescribed: at sim time `t` it is at angle `θ(t) = ω·t` on a circle of radius `ORBIT_RADIUS`, with `ω = PLANET_SPEED / ORBIT_RADIUS`, moving counter-clockwise. At `t = 0` the planet is at `(ORBIT_RADIUS, 0)` moving in `+y`. Its velocity is the exact derivative of that path.

### Initial ship state (tutorial)

The ship starts sunward of the planet, aimed straight at it, so the player must choose a side:

- `START_DISTANCE` = 4.0e6 km. Position relative to the planet: `(−START_DISTANCE, 0)`.
- `V_INF` = 10 km/s: the ship's speed relative to the planet *far from it* (its hyperbolic excess speed). The starting relative speed is the speed that energy conservation gives at `START_DISTANCE`: `√(V_INF² + 2·PLANET_GM / START_DISTANCE)` ≈ 12.6 km/s, directed `+x`.
- Star-frame state is the planet's state plus these offsets. The starting star-frame speed is about 18.3 km/s.

Coasting from this start is a collision: Jupiter's gravity focuses every approach with an offset under about six planet radii onto its surface. Pushing toward `−y` sends the ship across behind the planet (opposite its motion), which bends the planet-frame velocity toward `+y` and raises the star-frame speed: a **boost**. Pushing toward `+y` passes in front: a **brake**.

The initial values are tunable scenario constants. Changing them is a scenario choice, not a physics change.

### The level scenario

The level (`site/sim/levels.js`, owned by the `level` node) is a pond of three Jupiter-like worlds with no star. Its first world drifts exactly like the tutorial's planet at the moment the tutorial starts (13 km/s, "up"), and the ship starts as in the tutorial, so the level's first flyby is one the player has already flown.

### Fuel and thrust

- `THRUST_ACCEL` = 5e-5 km/s² at full throttle, along the ship's nose.
- `FUEL_DV` = 10.0 km/s total delta-v budget, generous enough to recover from a mistake.
- `TURN_RATE` = π/480 rad per step (a half-turn takes 4 sim hours, about 0.6 s at Normal). Turning is free: it never spends fuel.
- `SPOOL_STEPS` = 120 steps from engine start to full throttle (about 0.15 s at Normal).
- `ALIGN_TOLERANCE` = 10°: the engine fires only when the nose is this close to the aim.
- `PLAN_TURN_RATE` = π/2 rad per real second: how fast the aim turns while the player plans, paused.

**Aim, then burn.** The player has two controls. **Rotate** (`-1`, `0` or `+1`, counter-clockwise positive) turns the ship's **aim**, an absolute direction in the world (0 = +x, π/2 = +y, screen up), by `TURN_RATE` per step while held. **Thrust** (`+1` forward, `−1` reverse, `0` none) fires the engine along the nose, or against it. A step's input is a command `{ rotate, thrust }`; `null` or anything else means no input. Rotating never spends fuel; only thrust does. Which side of a world the ship passes, the thing that decides boost or brake, now follows from where the player points the ship and how hard they burn. `axes(state)` still returns the unit vectors toward the focus world and sideways from it, and `speedComponents(state)` splits the velocity relative to the focus world along them: the cockpit draws those as the speed arrows, so the player can see which way a burn bends the pass.

Steering takes time. The ship has a **heading** (where its nose points), an **aim** (where the player wants it to point) and a **throttle** (0 to 1). Every step the heading turns toward the aim by at most `TURN_RATE`. When thrust is wanted (held, or a queued burn) and the heading is within `ALIGN_TOLERANCE` of the aim, the engine spools up by `1/SPOOL_STEPS` per step, and thrust is `throttle · THRUST_ACCEL` along the heading (forward) or against it (reverse). When no thrust is wanted, or the nose is still turning, the engine is off and throttle drops to 0 at once.

Fuel is a delta-v budget: each firing step spends the delta-v it delivers (`throttle · THRUST_ACCEL · DT`). If a step would spend more than remains, its thrust is scaled down to use exactly what is left, and fuel is then exactly zero. Thrust has no effect when fuel is zero.

### Planned manoeuvres

A plan is the state's **aim** plus a signed **queued burn**, `planBurn` (km/s; + forward, − reverse). `planAim(state, dAngle)` turns the aim by `dAngle` radians, and `planningBurn(state, dv)` adds a signed `dv` to `planBurn`, clamped to ±`fuel`. Neither advances time, moves the ship, or spends fuel, and opposite calls cancel, so planning is fully reversible: a player can turn the nose, burn, change their mind, undo, and owe nothing. Both have no effect unless `status` is `'flying'`.

When no thrust is held and `planBurn` is non-zero, `step` flies it: the nose turns to the aim, the engine spools up, and it burns forward or in reverse until exactly `|planBurn|` has been delivered or fuel runs out, then cuts. Held thrust overrides the queued burn for as long as it is held. Because the prediction runs the same `step`, a queued manoeuvre appears in the prediction line with its turn and spool-up included.

With these values, burning about 30% of the fuel early gives a close pass (under two planet radii) worth roughly +6.6 km/s behind or −10.8 km/s in front; burning more gives wider, gentler passes. Fuel spent buys safety; fuel saved buys drama.

## State and Stepping

The sim state is a plain object:

```js
{ t, steps, pos: {x, y}, vel: {x, y}, grav: {x, y}, fuel, status, closest, startSpeed,
  heading, aim, throttle, planBurn, scenario }
// status: 'flying' | 'crashed' | 'departed' (flyby rule) | 'arrived' | 'lost' (level rule)
```

- `grav` is the gravitational acceleration at `pos` and `t`, **excluding thrust**. `initialState()` sets it to `gravity(pos, 0)`.
- `steps` counts steps taken since the start.
- `closest` is the smallest distance to the scenario's first world seen so far. The flyby rule and the tutorial's mid-swing checkpoint use it; the level rule does not.
- `focus` is the index of the focus world.
- `startSpeed` is the speed at `t = 0` in the scenario's frame (the star's, or the pond's).
- `scenario` is the scenario the state belongs to. It is shared, never copied or changed. `initialState(scenario)` defaults to the tutorial's.

`step(state, input)` advances by exactly one `DT` using **velocity Verlet**, with thrust `T` held constant across the step:

1. `pos += vel·DT + ½·(grav + T)·DT²`
2. `t += DT`, `steps += 1`
3. `gravNew = gravity(pos, t)`
4. `vel += ½·(grav + gravNew)·DT + T·DT`
5. `grav = gravNew`

`gravity(pos, t, scenario)` sums the inverse-square pull of the star (if any) at the origin and of every world at its prescribed position at time `t`.

The input is a command `{ rotate, thrust }` (see *Fuel and thrust*); `null` means none.

After each step:

- If the ship is within any world's radius of that world's centre, `status` becomes `'crashed'`.
- Otherwise the scenario's end rule applies: `'departed'` (flyby rule), or `'arrived'` / `'lost'` (level rule), as described under *Scenarios and worlds*.

When `status` is not `'flying'`, `step` returns the state unchanged and spends no fuel.

`step` returns a new state and does not mutate its input. Internally, prediction and multi-step advance use an in-place variant of the same arithmetic for speed; the two must produce identical numbers.

## Time Control

Time settings are measured in **steps per real second**, not per rendered frame, so the game runs at the same pace on 60 Hz and 120 Hz displays:

| Setting | Steps per real second | Sim time per real second |
|---|---|---|
| paused | 0 | 0 |
| slow | 200 | ~1.7 hours |
| normal | 800 | ~6.7 hours |
| fast | 3300 | ~27.5 hours |

`stepsForFrame(setting, elapsedSeconds, carry)` returns `{ steps, carry }`. It converts the real time since the last frame into a whole number of steps and carries the fractional remainder to the next frame. Elapsed time above 0.25 s (a background tab, a stall) is clamped to 0.25 s, so the game never jumps ahead after being hidden.

`advance(state, steps, input)` runs `step` that many times and returns `{ state, samples }`, where `samples` holds the ship's position and the time at every step whose global `steps` count is a multiple of 10 (every 5 sim minutes), so the cockpit can draw the trail in any world's frame. The cockpit draws its trail from these samples.

`DT` is identical in every setting. A trajectory depends only on the total number of steps and the thrust applied at each, never on how the steps were grouped into frames.

At Normal, coasting to closest approach from the start takes about 35 real seconds, and spending all the fuel takes about 7 seconds of holding an arrow.

## Prediction Line

`predict(state, maxSteps)` runs the same step arithmetic from a copy of the state with **no thrust**, for up to `maxSteps` (the scenario's prediction horizon by default: 20,000 steps, about 7 sim days, for the tutorial's single flyby; 40,000 for the level, enough to see past the next world), recording every 20th step. It stops early if the copy's flight ends (crash, departure, arrival or lost). Each recorded point carries the ship's position and the time, and the result reports how it ended (`'crashed'`, `'departed'`, `'arrived'`, `'lost'`, or `'horizon'` when `maxSteps` ran out). The cockpit computes a prediction only while paused, where it is shown.

The prediction shows the coasting path from the current state. While the player is burning, it updates every frame to show where the ship will go if they stop now.

Because thrust is not stored in the state, a prediction made from any state matches the live trajectory step for step as long as no further thrust is applied.

## Frames and Readouts

- `focusWorld(state)`: the index of the focus world (`state.focus`).
- `worldPosition(scenario, i, t)`, `worldVelocity(scenario, i, t)`: a world's prescribed motion.
- `starFrameSpeed(state)`: `|vel|`, in the scenario's frame (the star's or the pond's). This is the speed the player sees.
- `planetFrameVelocity(state)`: `vel` minus the focus world's velocity.
- `planetRelativePosition(state)`: `pos` minus the focus world's position.
- `speedChange(state)`: `starFrameSpeed(state) − startSpeed`.
- `farSpeed(state, i)`: the far speed relative to world `i`, as defined under *Scenarios and worlds*.

## Physical Acceptance Tests

These define "the physics works" for this slice:

1. **Flyby speed conservation.** A test builds a coasting state with no thrust, `START_DISTANCE` from the planet with a sideways offset that clears the surface. At the first step inside 2.5e6 km of the planet and the first step back outside it, the planet-frame speeds agree within 0.1%. The star's tide contributes about 0.004%, so a failure means the integrator or the frames are wrong.
2. **Boost behind, brake in front.** From the default start, burning half the fuel from `t = 0` toward `−y` and then coasting to `'departed'` ends with a star-frame speed above `startSpeed`. The same burn toward `+y` ends below it.
3. **Time-setting invariance.** Advancing the same total number of steps grouped as fast frames versus slow frames gives an identical state.
4. **Prediction fidelity.** With no thrust, the live state after `n·20` steps matches the prediction's `n`-th point.
5. **Default start crashes.** Coasting from the default start with no thrust ends in `'crashed'`.
6. **Flyby speed conservation, drifting world.** A scenario with a single drifting world: a coasting flyby conserves the speed relative to that world within 0.1% at 2.5 million km before and after, as in test 1. (A single world isolates the frame arithmetic; in the level, the other worlds' tides at tens of millions of km change it by a fraction of a percent, which is real physics.)
7. **The tutorial is unchanged.** Every tutorial test passes with the tutorial scenario passed explicitly and with the default.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Integrator | Velocity Verlet, fixed `DT` | Euler; RK4; adaptive step | Symplectic, so flyby speed in the planet frame is conserved and orbits don't spiral. Euler gains energy. RK4 drifts over long runs. An adaptive step would break the guarantee that time settings and prediction follow the same trajectory. |
| `DT` value | 30 s | 1 s; 300 s | At a near-grazing pass (about 60 km/s) one step moves about 2.5% of a planet radius, keeping the per-flyby error far below the 0.1% test tolerance. Smaller steps make fast-forward expensive; larger steps fail close passes. |
| Thrust in state | Not stored; gravity-only `grav` field | Store total acceleration | A stored total acceleration carries half a step of thrust into the next step and into any prediction, breaking exact prediction. |
| Planet motion | Prescribed circular orbit | Integrate the planet under the star's gravity | It can't drift, its velocity is exact, and the scenario is reproducible. |
| Units | km, s, GM in km³/s² | SI metres and kg; game units | Real values at readable magnitudes. Game units would invite quietly unphysical numbers. |
| Scenario | Sun + Jupiter, ship 4e6 km out, 10 km/s hyperbolic excess speed | 3e6 km at 10 km/s *local* speed; Earth or Venus | Specifying the far-field speed matches the brief's "arriving at 10 km/s" and keeps a strong assist. A start at 3e6 km with 10 km/s local speed leaves only about 4 km/s far-field, and the planet captures nearly every approach. |
| Thrust and fuel | 5e-5 km/s², 10 km/s budget | 2e-5 km/s² with 2 km/s; 5 km/s | Simulated: the smallest budget crashes unless the player burns everything at once. 10 km/s gives a real choice of side and distance and room to recover from a mistake. |
| Time control unit | Steps per real second with a fractional carry and 0.25 s clamp | Steps per animation frame | Per-frame stepping runs twice as fast on 120 Hz displays and leaps after a background tab. |
| End of flyby | `'departed'` status once back beyond `START_DISTANCE` after closest approach | Run forever | Gives the cockpit a moment to show the result and gives test 2 a defined measurement point. |
| Planning while paused | Queue a manoeuvre the ship flies on resume | Instant velocity change; disallow | Paused means mapping a course, not spending fuel. Flying the plan with real turning and spool-up keeps it physically honest, and the prediction shows exactly what will happen. |
| Crash | Status flag at physical radius; sim freezes | Bounce; pass through | Honest and simple. The visual radius is never used. |
| More than one world | Scenarios as data: worlds with prescribed motion, every world's gravity summed | Only the nearest world's gravity (patched conics); integrating the worlds too | Summing every pull is the real physics and has no seams that could look like bugs. Prescribed motion keeps the level reproducible, as the tutorial's prescribed orbit does. |
| What the speed arrows measure against | The focus world: the nearest one | The destination; a world the player picks | The nearest world is the one whose flyby is happening; splitting speed relative to a far world would say nothing about the pass. |
| "Caught" | Within the catch radius with a far speed under the catch speed | Bound to the world (negative energy); plain relative speed under a threshold | Being bound needs an orbit-insertion burn the gentle sideways thrust cannot give. Plain relative speed grows as the ship falls in, so "slow enough" would depend on where it is measured. The far speed is the honest, distance-independent measure. |
| Steering | Rotate and thrust: the player turns the aim for free and fires forward or in reverse along the nose; the nose turns at a limited rate and the engine spools up | Sideways pushes only (up or down relative to the planet); four world directions; instant thrust in any direction | Pointing and burning is how a real ship is flown, and a kid can see it: the ship is drawn pointing where it will push. Sideways-only was a single control, but it hid the ship's direction behind an axis that changed with the nearest planet. Free rotation keeps fuel the score: only what changes the ship's speed costs anything. Reverse thrust lets a player slow down without turning around; fuel is still too scarce to replace a braking flyby. |

## Open Questions & Future Decisions

### Resolved
1. ✅ The star is fixed at the origin and unaffected by the planet. The planet-to-star mass ratio (about 1/1000) makes its wobble irrelevant for this slice.

### Deferred
1. Worlds that feel each other's gravity.
2. Whether fuel should be shown and tuned as delta-v or as an abstract "fuel" unit for kids.

## References

- `docs/high-level-design.md`
- `docs/slingshot-context.md` (physics ground rules, reference numbers)
