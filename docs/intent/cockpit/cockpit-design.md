---
parent: high-level-design
prefix: COCKPIT
---

# Cockpit

## Context and Design Philosophy

The cockpit is everything the player sees and touches: a full-window canvas, the speed readout, the fuel bar, the time controls, and the keyboard. Each animation frame it reads the held keys, asks the flight sim to advance, recomputes the prediction, and draws.

It owns presentation only. It never computes gravity or changes physics values; it converts sim kilometres into pixels and nothing flows back the other way. What a kid needs to see comes first: one big number, one line, one bar. Debug data stays off the default screen.

## Camera: the Focus World's Frame

The camera frames the **play area**: the whole canvas, or, while a tour card is shown, the band between the top readouts and the card strip (see `tour`), so nothing the player steers by sits under the card. The view is centred on the **focus world** (the world nearest the ship, see `flight-sim`) and moves with it. In the tutorial that is always the one planet. Positions are drawn as `ship − focus world` at the same sim time, so:

- The focus world sits still in the middle of the screen.
- The prediction line is drawn as each predicted ship point minus the focus world's position at that point's time. It shows the clean hyperbola the ship traces around the planet, which is the shape a kid can steer.
- The past trail is drawn from the samples the sim returns every 10 steps (`advance`'s `samples`: position and time), each drawn relative to the focus world's position at its own time, capped at the most recent 3,000. Reset clears it. Paused frames add nothing.

When the focus changes from one world to another, the camera eases over to the new world, so the picture glides rather than jumps. Because each world drifts at a constant velocity, every world's frame is an honest inertial view; switching frames re-draws the trail as seen from the new world.

The direction the planet is moving (`+y` in the world, drawn as **up** on screen) is shown as a short arrow beside the planet labelled "planet moving this way". With that arrow, "behind" (below the planet) and "in front" (above it) are visible without explanation. A faint arrow at the screen edge points toward the star.

World `+x` is screen right and world `+y` is screen up. The view does not rotate.

### Auto-zoom and storybook proportions

The scale (km per pixel) follows the ship's distance from the focus world, so the ship and the world it is steering by are always on screen together:

- Target scale: the ship-to-focus-world distance spans 35% of the smaller screen dimension, clamped between a closest zoom of 1,000 km/px and a widest zoom of 20,000 km/px.
- **Safe area.** The target scale is also never smaller than needed to keep the ship inside the area clear of the HUD: 170 px below the top edge (speed readout), 110 px above the bottom edge (time buttons), and 40 px in from each side.
- The scale eases toward the target by 15% per frame, and the camera centre eases toward its target by 12% per frame, so neither a zoom nor a change of focus world ever jumps. On load and on reset both snap straight to their targets.

Drawn sizes are decoupled from physical sizes:

- The **ship** is always drawn 12 px across, a small rocket pointing along its heading, with a flame from its tail while the engine fires.
- **Every world** is drawn with radius `max(its radius / scale, 24 px)`, with Jupiter-like bands. When zoomed out it is inflated to stay visible; when zoomed in close enough, its drawn edge is its true edge.
- **No false overlaps.** Around the focus world, the ship, the trail and the prediction line are drawn through a smooth radial remap: a point at true screen distance `d` from the focus world's centre is drawn at `√(d² + K²)` on the same bearing, with `K² = (drawn radius + 6 px)² − (true radius in px)²` (zero when the world is not inflated). Close passes bend smoothly around the drawn world instead of crossing it; far points barely move. Only a crashed ship is drawn at its true position. Worlds that are not the focus are far from the ship whenever they are not the focus, so no remap is applied around them. All of this changes only where things are painted, never the sim state.

The canvas fills the window, resizes with it, and renders at the device pixel ratio so shapes stay crisp.

The star is not drawn in the planet-frame view (it is about 780 million km away), only its direction arrow.

## In the Level

The level (`level` node) is a pond of drifting worlds. Besides following the focus world:

- **Every world is drawn** (one draw per world, each frame), each with its name in a small pill, at its current position in the focus world's frame. Each world has its own "moving this way" arrow, showing its drift relative to the pond.
- **Changing focus.** When the focus world changes (see `flight-sim`: only once another world is 10% nearer), the trail and the prediction line are redrawn at once in the new world's frame while the camera eases across.
- **Speed.** "Your speed" is the pond-frame speed, and its change is measured from the level's starting speed.
- **No Star badge.** The level has no star; the badge appears only in scenarios that have one.
- **Destination marker.** Haven is marked with a pulsing ring at its catch radius, drawn at true scale but never smaller than 30 px. While Haven is off screen, an arrow at the screen edge points to it, labelled "Haven" with its distance in million km.
- **Approach readout.** While the ship is within the catch radius, a pill under the speed readout shows the far speed relative to Haven (the flight sim's `farSpeed`) against the catch speed, e.g. "Approach 7.2 km/s · need under 5", green once it is low enough.
- **Ready and result cards.** The level has its own texts, decided by the pure `site/cockpit/level.js` (see `level`): the ready card, and the result card (stars and fuel left, "Bonk! You hit <world>", or "Lost in space"). They use the same centred message area as the tutorial's messages. The tutorial's "pick a side", "Bonk! You hit the planet" and Boost/Brake texts appear only in the tutorial.
- **Which scenario.** The page loads into the tutorial; I'm ready or Skip tour starts the level; ? returns to the tutorial. R restarts whichever is showing.

## Readouts

- **Speed** (top centre, large): a small caps label "Your speed" above the star-frame speed in km/s to one decimal, e.g. `19.6 km/s`. Below it, smaller, the change from the starting speed: `▲ +3.2` in green when higher, `▼ −3.1` in red when lower, grey within ±0.05. The arrow glyph carries the meaning as well as the colour.
- **Fuel** (top left): a small caps label "Fuel" above a rounded horizontal bar showing remaining delta-v as a fraction of the budget. The fill is sky blue and turns red under 20%.
- **Time** (bottom centre): four pill buttons labelled Pause, Slow, Normal, Fast, each with a simple stroke icon (two bars, one chevron, one triangle, two triangles). The active one is filled cyan; the others are outlined.
- **Planet-motion label**: the planet-motion arrow is yellow and labelled "planet moving this way" beside its tip.
- **Ready**: on load and after reset, before the first unpause, a centred message "Push up or down to pick a side, then press Space to go."
- **Crash**: when the sim status is `crashed`, a centred message "Bonk! You hit the planet. Press R to try again."
- **Result**: when the sim status is `departed`, a centred card with the final speed change: "Boost! +6.6 km/s" in green if `speedChange` is above +0.05, "Brake! −10.8 km/s" in red if below −0.05, otherwise "No change", plus "Fuel left: 70%" and "Press R to fly again." During the flyby the live `▲/▼` change keeps updating; the card is the result.
- **Help** (top right, small, right-aligned, clear of the time buttons at any width): "Arrows: push · Space: pause · 1–4: pause/slow/normal/fast · R: restart".

The planet-frame speed is not displayed in this slice.

## Controls

| Input | Effect |
|---|---|
| ← / → (held) | Rotate the ship: ← turns the aim counter-clockwise, → clockwise, at the ship's turn rate. Turning is free. |
| ↑ / ↓ (held) | Burn: ↑ fires the engine forward along the nose, ↓ in reverse. Burning spends fuel. Both controls can be held together. |
| Space | Toggle pause. Unpausing returns to the setting that was active before the pause. |
| 1 / 2 / 3 / 4 | Pause / Slow / Normal / Fast (2–4 also unpause) |
| R | Reset to the initial scenario: new sim state, cleared trail, paused in the ready state, time setting kept |
| Click a time button | Same as the matching key |

**Drag to steer (touch and mouse).** Pressing anywhere on the canvas with a finger or the mouse and dragging works like holding arrows. Once the pointer is more than 24 px from where it went down, the horizontal part of the drag rotates (left: counter-clockwise, right: clockwise) and the vertical part burns (up: forward, down: reverse); each part counts only beyond 24 px on its own axis, so a mostly-sideways drag only rotates. The input updates as the drag moves and stops when the pointer is released, cancelled, or the window loses focus. The canvas captures the pointer, so dragging off the edge keeps steering. While a drag is active, a faint ring marks where it started and an arrow points from there to the pointer. Keyboard arrows, if also held, take priority. All of this uses Pointer Events, so one code path serves touch, mouse and pen.

Key handling is on the window, so no element needs focus. Arrow keys and Space call `preventDefault`, so the page never scrolls and a focused button is never activated by Space; time buttons also drop focus after a click. When the window loses focus, all held arrows are released.

**Pause-and-plan.** While paused and the ship is flying, held arrows or a drag shape a *planned course*: the cockpit keeps a separate planned state, turning its aim with `planAim` at `PLAN_TURN_RATE` (a quarter turn per real second) and adding to its burn with `planningBurn` at `PLAN_RATE` (5/3 km/s per real second), and draws the prediction from the plan. Rotating while paused turns the ship itself, at once, so the nose always shows where a burn will push; the planned burn is drawn as a dashed arrow along the nose, labelled "x.x km/s burn (planned)" (or "reverse"). The live state is untouched, so no fuel is spent while planning. On resume, the planned state becomes the live state and its fuel is charged; reset discards it. The fuel bar shows the plan's cost as a striped section between the fuel left after the plan and the fuel held now. This is the intended way to pick a side from the ready state.

The page starts **paused** in the ready state, with Normal as the setting it resumes to.

## Phones and Touch Screens

- The page disables browser panning and pinch-zoom over the game (`touch-action: none`), so drags steer the ship instead of scrolling the page.
- On a touch-first device (`pointer: coarse`), the help line reads "Drag sideways: aim · up/down: burn · buttons: speed", and the ready message reads "Drag sideways to aim, up or down to burn, then tap Normal to go."
- On screens narrower than 600 px, the speed readout shrinks (40 px number), the fuel bar narrows to 110 px, the help line is hidden, and the time buttons shrink to fit four across while staying at least 44 px tall. Message cards fit within the screen width minus 32 px.

## Frame Loop

Each `requestAnimationFrame`:

1. Determine the push from the held-arrow stack, else from an active drag.
2. `{ steps, carry } = stepsForFrame(timeSetting, elapsedSeconds, carry)`.
3. If steps ran: `{ state, samples } = advance(state, steps, push)`, append `samples` to the trail, and recompute the prediction from the state. If paused with a push held: apply it to the planned state and recompute the prediction from the plan.
4. Send any analytics event for a status change (`flightEvents`).
5. Update the camera scale.
6. Draw background, Star badge, trail, the prediction line (only while paused), planet, planet-motion arrow, ship (flame sized by throttle), speed arrows, drag hint, then readouts and any message.

The decisions in steps 4 to 6 (scale, path bend, drag direction, fuel bar, messages, Star badge, prediction visibility, analytics events) are pure functions in `site/cockpit/view.js`, unit-tested in `tests/cockpit.test.js`; `main.js` only wires input and draws.

## Visual Style

A dark navy background (`#0b1530`) with a sparse fixed starfield, bright flat shapes, and rounded sans-serif text (Nunito where available, else the system sans). The ship is a white rocket with a blue window, red fins and an orange flame. The planet is tan with darker and lighter bands and a small red spot. The prediction line is dashed bright cyan (`#22d3ee`); the trail is solid, faint white. No images are loaded; everything is drawn with canvas primitives.

The approved visual reference is the cockpit mockup canvas "Slingshot cockpit mockup" (frame: mid-flyby, passing behind).

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Camera frame | Centred on the focus world, drawn in its frame | Star-frame view following the ship; fixed star-centred view | In the planet's frame the path is a clean, symmetrical bend and the planet stays put, which is easiest to steer by. A star-centred view at Jupiter's distance makes the flyby invisibly small. The star-frame gain is what the speed number shows. |
| Behind / in front cue | Planet-motion arrow, world `+y` drawn up | No cue; label the sides | One arrow is enough for "go behind it / go in front of it" and avoids text-heavy labels. |
| Zoom | Automatic, based on ship–planet distance | Manual zoom keys; fixed scale | Keeps ship and planet on screen with no extra control to learn. A fixed scale cannot show both the 4-million-km approach and a near-surface pass. |
| Ship and paths near an inflated planet | Smooth radial remap: distance d drawn at √(d² + K²), so the true surface lands just outside the drawn edge | Push points out to the edge; rely on zoom alone | Zoom eases and can lag, and an inflated planet would otherwise swallow close passes. A hard push-out made paths hug the edge with kinks; the smooth remap keeps an elliptical-looking swing and never folds. |
| Start state | Paused with a "pick a side" prompt | Start running at Normal | From the start the ship must steer within seconds; starting paused gives a kid time to read the screen first. |
| Result moment | Card on `departed` | Only the live change readout | Star-frame speed swings by tens of km/s during the pass; the card gives one clear answer. |
| Planet drawn size | `max(true size, 24 px)` | Always inflated; always true | Inflated when far for visibility, true when close so the drawn edge never contradicts the crash radius. |
| Ship drawn size | Constant 12 px | True scale | A true-scale ship is far below a pixel. A constant size keeps the ship comparable to the planet on screen. |
| Thrust input | Rotate with ← → or a horizontal drag (free); burn forward or in reverse with ↑ ↓ or a vertical drag | Sideways pushes only; four arrow keys on world axes | Aim-then-burn is how a ship is really flown, and the ship is drawn pointing where it will push, so a kid can see what a burn will do. The speed arrows still show the sideways speed that decides which side of the planet the ship passes. |
| Prediction visibility | Only while paused | Always on | Pause is for planning, play is for flying: while running, the screen shows only what is actually happening. |
| Rendering | Canvas 2D, no libraries | WebGL; DOM/SVG | Enough for a handful of shapes and a few thousand line points per frame, with no dependencies. |
| Readouts | HTML elements over the canvas | Drawn on canvas | Crisp text and clickable buttons for free. |

## Open Questions & Future Decisions

### Deferred
3. A debug overlay (planet-frame speed, closest-approach distance) behind a hidden key.
4. Whether to show the predicted post-flyby speed before the flyby happens.

## References

- `docs/high-level-design.md`
- `docs/intent/flight-sim/flight-sim-design.md` (state shape, `advance`, `predict`, readout functions)
