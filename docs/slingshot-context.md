# Slingshot: Lily Pond Concept Brief

A browser-based space game for kids aged 7 to 12 that teaches gravity assists by making them the core movement system rather than a lesson. Deployed at slingshot.andreizimin.com.

## The pitch

You are a small ship with almost no fuel in a pond of drifting star systems. Each system is a lily pad. You cannot cruise between them; you can only borrow speed from the planets inside each one. Pass behind a planet to speed up, pass in front to slow down. The map starts in one corner and opens outward as you reach systems that only chained slingshots can get you to.

The fun is escalation: getting further and faster, one lily at a time.

## Why the lily pond works

- **The lilies drift.** There is no standing still, and every system is a moving engine. A moving system is exactly what makes a slingshot pay out, so kids intuit "catch the lily moving the right way."
- **Speed is a resource carried between lilies.** Arrive too fast and you overshoot, so you must brake by passing in front. Arrive too slow and the next lily is out of reach.
- **Systems do not gravitationally interact with each other.** This keeps the physics clean and each flyby readable.
- **An expanding map gives progression** without needing bigger and bigger boosts.

## Core verbs

- **Steer the approach.** A small burn long before the flyby cheaply changes the closest approach distance. Burns after the flyby barely matter. Fuel is scarce and is effectively the score.
- **Control time.** Slow motion near a planet, fast-forward across empty gaps, and a pause-and-plan mode where the kid nudges the approach and watches the prediction change. Time control is a core verb, not a settings slider.
- **Read the prediction line.** While paused, a trajectory projection shows exactly where the planned course leads and updates as the player adjusts it. This is the single most important readability feature. While the ship flies, it is hidden, so the screen shows only what is actually happening.

## Physics ground rules

- **Fidelity is non-negotiable.** Real numbers under the hood, storybook exaggeration on screen. Little Prince proportions: big visible ship, small cartoon planets. The visual radius must never leak into the gravity calculation.
- **Realistic speeds.** Ship speeds live in the same tens-of-km/s range as the planets, starting around 10 km/s. At much higher speeds a planet cannot bend the path, and the mechanic feels like nothing happened.
- **Symplectic integrator.** Use velocity Verlet or another symplectic scheme. Naive Euler makes orbits spiral and assists come out wrong, which looks like a game bug but is a maths bug.
- **Time scaling must not change the orbit.** Fix the physics step size and vary the number of steps per frame. Never stretch the step.
- **Prediction line.** Run the same integrator ahead a few hundred steps on a copy of the state. Build it on day one; it doubles as the physics debugger.
- **Acceptance test for any flyby.** In the planet's frame, exit speed equals entry speed within a tight tolerance.

## Reference numbers

Rough gains for a ship arriving at 10 km/s, skimming just above the surface, with best-case geometry. The ceiling is twice the body's orbital speed.

| Body    | Bend      | Gain           | Ceiling  |
|---------|-----------|----------------|----------|
| Moon    | < 3°      | ~0.5 km/s      | 2 km/s   |
| Venus   | ~38°      | ~6.5 km/s      | 70 km/s  |
| Earth   | ~42°      | ~7 km/s        | 60 km/s  |
| Jupiter | ~140°     | nearly 19 km/s | 26 km/s  |

The lesson hiding here: a body has to be both heavy and moving fast. Venus and Earth have huge ceilings but are too light to cash them in. Jupiter nearly reaches its ceiling. The Moon barely does anything, which makes it a good late-game joke level rather than a tutorial.

## Lessons from the first attempt

Handing the full spec to Claude Code in one go did not produce a working game. The new approach is small, incremental vertical slices, each with a physical acceptance test, before any mission structure or narrative exists.

## First vertical slice

- One lily: a single planet on a fixed circular orbit around a star.
- One ship with position, velocity, and a tiny fuel budget.
- Symplectic integrator with a fixed step and variable steps per frame.
- Prediction line while paused, for planning.
- A speed readout in the star's frame.
- Time controls: pause, slow, normal, fast.
- Pass behind the planet and watch the speed readout climb; pass in front and watch it fall.

**Done when** the frame-invariance acceptance test passes and a tester can reliably produce both a boost and a brake.

## Open questions

- How much thrust and fuel, and how to show the fuel budget to a kid.
- How lilies drift: fixed paths, or slowly random.
- How the map reveals itself as the player reaches new systems.
- Narrative wrapper, if any. The courier framing ("you can't push, you can only borrow") is a fallback, but the pond may not need a story at all.
