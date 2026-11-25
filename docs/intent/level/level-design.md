---
parent: high-level-design
prefix: LEVEL
---

# Level

## Context and Design Philosophy

The level is the game the tutorial prepares the player for. The ship has nowhere near enough fuel to reach its destination on its own, so the only way there is to chain slingshots: borrow speed from one world, shed it at another, and arrive slowly enough to be caught. Fuel left at the end is the score.

This first version is one hand-designed level, small enough to tune by playing it. Its two defining properties are proven by a solver before anyone plays it: a chained route exists with fuel to spare, and fuel alone cannot do it. Both are tests.

The physics is the flight sim's, unchanged: the level is a scenario (data) the sim runs. This node owns what the scenario contains, how a flight ends in a win or a loss, how it is scored, and how the level is entered and replayed.

## The Pond

Three Jupiter-like worlds (GM 1.26687e8 km³/s², radius 71,492 km) drift across a flat pond at constant velocities. Positions are given at the level's start (`t = 0`); "up" is +y.

| World | Role | Start position (million km) | Drift (km/s) |
|---|---|---|---|
| **Home** | The world the ship starts next to | (0, 0) | (0, 13) |
| **Racer** | A fast world crossing the route | (−9.776, 14.385) | (14, 0) |
| **Haven** | The destination | (3.344, 9.463) | (−7.023, 14.733) |

The ship starts exactly as in the tutorial, relative to Home: 4 million km on Home's −x side, moving straight at it at the speed that 10 km/s of approach far away becomes at that distance (`√(10² + 2·GM/4e6)` ≈ 12.6 km/s), plus Home's drift. In the pond frame that is about (12.6, 13) km/s, a speed of about 18.1 km/s, which is the level's starting speed for the speed readout. The level's first flyby is therefore one the player has already flown. Fuel is the tutorial's 10 km/s.

**The designed route.** Pass **behind Home** (a boost that sends the ship up toward Racer), then pass **in front of Racer** (a brake that throws the ship back toward Haven), then arrive at Haven slowly enough to be caught. The level teaches both sides of a slingshot in one journey: the first speeds you up, the second slows you down.

## Winning and Losing

- **Arrived (win).** The ship is caught by Haven: within its **catch radius of 3 million km**, with a **far speed** relative to Haven under the **catch speed of 5 km/s**. Far speed is defined by the flight sim: the speed the ship would have relative to Haven if it climbed out of Haven's gravity, so it does not grow as the ship falls in.
- **Crashed (loss).** The ship hits any world.
- **Lost (loss).** The ship is farther than **30 million km** from every world.

The checks run after every physics step, in the order crashed, arrived, lost (see `flight-sim`), so a fast pass through the catch zone cannot be skipped between frames. Distances are to world centres; "under 5 km/s" and "farther than 30 million km" are strict.

There is no time limit. Passing Haven too fast is not itself a loss: the ship coasts on, and may still be caught later or become lost. A ship that settles into a long orbit around some world simply keeps flying until the player restarts.

## Score

Any arrival earns stars by fuel left, out of the 10 km/s budget:

| Fuel left | Stars |
|---|---|
| 6 km/s or more | ★★★ |
| 3 km/s or more | ★★ |
| less than 3 km/s | ★ |

A crash or getting lost earns no stars. Stars are decided from the exact fuel left in km/s; the analytics event reports fuel left as a whole percentage of the budget, rounded to the nearest percent, so a run with 5.996 km/s left reads "60%" and earns ★★.

## Flow

- **Entering.** **Sample mission** on the start screen starts the level; so do the tutorial's last card, **I'm ready**, and **Skip tour**. The level opens paused, with a ready card: "Fly to Haven. You can't get there on fuel alone: chain slingshots, and arrive slowly enough to be caught."
- **Playing.** All controls work as after the tutorial: plan while paused, fly with Slow, Normal or Fast.
- **The end.** A result card shows the outcome:
  - Arrived: the stars, fuel left, and **Fly again**.
  - Crashed: "Bonk! You hit Home/Racer/Haven" (the world's name) and **Try again**.
  - Lost: "Lost in space" and **Try again**.
- **Again.** R, at any time, or the card's button restarts the level from its start: a fresh flight with full fuel, no plan, the trail cleared, paused on the ready card, the camera on Home. The **?** button abandons the level flight (no end event is sent) and replays the tutorial from step 1, which ends at the level again.

## Proving the Level

`scripts/design-level.mjs` holds the level's design search: it flies the real flight sim over a grid of player plans (a first push at Home, a correction on the way to Racer, an adjustment approaching Haven) and reports which routes win and with how much fuel. It was used to place Racer and Haven, and is rerun whenever the level changes.

Two properties are unit tests on the real level data and the real sim:

1. **A chained route wins.** The designed route, aiming the nose straight down (−90°) and queuing a 3 km/s forward burn while paused at the start, which swings the ship behind Home, and then coasting with the real step, turning and spool-up included, is caught by Haven with at least 6 km/s of fuel left: three stars.
2. **Fuel alone cannot.** Haven's drift differs from the ship's starting pond-frame velocity by about 23.6 km/s, more than the fuel budget plus the catch speed (15 km/s), so no use of fuel without help from the worlds can match Haven's motion.

The design search also showed the level is forgiving: first burns between 2 and 4 km/s aimed straight down can still win with one later correction burn, earning fewer stars the less efficient they are, and no route that starts by passing in front of Home wins.

## Analytics

Two events through the shared tracker (see `analytics`): `slingshot_level_start` whenever a fresh level flight is set up (from I'm ready, Skip tour, R or Try again), and `slingshot_level_end`, sent once when a level flight ends, with `outcome` (`arrived`, `crashed`, `lost`), `fuel_left` (whole % of the budget) and `stars` (0–3).

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| What a lily is | A single massive world drifting across the pond | Planets of one star system (a grand tour); drifting star systems placed unrealistically close | The smallest honest step from the tutorial's physics: real gravity from every world, no stitching, realistic spacing, and "catch the lily moving the right way" is literal. |
| Scope | One designed level | Three short levels; an endless random pond | One level can be tuned by playing it, and proven by a solver. Variety comes after the core feels right. |
| Arrival | Caught: within the catch radius, far speed under the catch speed | Pass within a distance at any speed | Makes braking (passing in front) part of the game, as the concept brief intends. |
| Score | 1–3 stars by fuel left | Fuel number only; no score | Fuel is the brief's score; stars make it readable to a kid at a glance. |
| Start | The tutorial's start, next to a world drifting like the tutorial's planet | A fresh start | The first flyby is familiar, so the new lesson (braking, chaining) gets the attention. |
| Level data | Literal numbers in `levels.js`, checked by tests | Computed at load time from a route | The level is content: its numbers should be readable and stable, and the tests catch any edit that breaks it. |
| Losing | Crash, or lost beyond 30 million km of every world | A time limit | A time limit punishes slow, careful play, which is what the game is trying to teach. |

## Open Questions & Future Decisions

### Deferred
1. More levels, a map that reveals them, and missions (the concept brief's lily pond).
2. A best-stars record kept between visits.
3. Tuning the catch speed and star thresholds from play-testing on dev.

## References

- `docs/intent/flight-sim/flight-sim-design.md` (scenarios, far speed)
- `docs/intent/cockpit/cockpit-design.md` (camera, destination marker, result card)
- `docs/change-orders/CO-002-main-game.md`
- `docs/slingshot-context.md` (the lily pond)
