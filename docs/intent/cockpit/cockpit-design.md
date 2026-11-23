---
parent: high-level-design
prefix: COCKPIT
---

# Cockpit

## Context and Design Philosophy

The cockpit is everything the player sees and touches: a full-window canvas, the speed readout, the fuel bar, the time controls, and the keyboard. Each animation frame it reads the held keys, asks the flight sim to advance, recomputes the prediction, and draws.

It owns presentation only. It never computes gravity or changes physics values; it converts sim kilometres into pixels and nothing flows back the other way. What a kid needs to see comes first: one big number, one line, one bar. Debug data stays off the default screen.

## Camera: the Planet's Frame

The view is centred on the planet and moves with it. Positions are drawn as `ship − planet` at the same sim time, so:

- The planet sits still in the middle of the screen.
- The prediction line is drawn as each predicted ship point minus the planet position recorded with it. It shows the clean hyperbola the ship traces around the planet, which is the shape a kid can steer.
- The past trail is drawn from the planet-relative samples the sim returns every 10 steps (`advance`'s `samples`), capped at the most recent 3,000. Reset clears it. Paused frames add nothing.

The direction the planet is moving (`+y` in the world, drawn as **up** on screen) is shown as a short arrow beside the planet labelled "planet moving this way". With that arrow, "behind" (below the planet) and "in front" (above it) are visible without explanation. A faint arrow at the screen edge points toward the star.

World `+x` is screen right and world `+y` is screen up. The view does not rotate.

### Auto-zoom and storybook proportions

The scale (km per pixel) follows the ship's distance from the planet, so the ship and the planet are always on screen together:

- Target scale: the ship-to-planet distance spans 35% of the smaller screen dimension, clamped between a closest zoom of 1,000 km/px and a widest zoom of 20,000 km/px.
- **Safe area.** The target scale is also never smaller than needed to keep the ship inside the area clear of the HUD: 170 px below the top edge (speed readout), 110 px above the bottom edge (time buttons), and 40 px in from each side.
- The scale eases toward the target by 15% per frame, so zooming never jumps. On load and on reset it snaps straight to the target.

Drawn sizes are decoupled from physical sizes:

- The **ship** is always drawn 12 px across, a small rocket shape pointing along its planet-frame velocity, with a flame on the side opposite any active burn.
- The **planet** is drawn with radius `max(PLANET_RADIUS / scale, 24 px)`, with Jupiter-like bands. When zoomed out it is inflated to stay visible; when zoomed in close enough, its drawn edge is its true edge.
- **No false overlaps.** While the ship is flying, if its drawn centre would fall inside the drawn planet plus 8 px (the zoom is still catching up, or the planet is inflated), the ship is drawn on the same bearing from the planet centre at exactly that drawn radius plus 8 px. Only a real crash draws the ship touching the planet. This changes only where the ship is painted, never the sim state.

The canvas fills the window, resizes with it, and renders at the device pixel ratio so shapes stay crisp.

The star is not drawn in the planet-frame view (it is about 780 million km away), only its direction arrow.

## Readouts

- **Speed** (top centre, large): a small caps label "Your speed" above the star-frame speed in km/s to one decimal, e.g. `19.6 km/s`. Below it, smaller, the change from the starting speed: `▲ +3.2` in green when higher, `▼ −3.1` in red when lower, grey within ±0.05. The arrow glyph carries the meaning as well as the colour.
- **Fuel** (top left): a small caps label "Fuel" above a rounded horizontal bar showing remaining delta-v as a fraction of the budget. The fill is sky blue and turns red under 20%.
- **Time** (bottom centre): four pill buttons labelled Pause, Slow, Normal, Fast, each with a simple stroke icon (two bars, one chevron, one triangle, two triangles). The active one is filled cyan; the others are outlined.
- **Planet-motion label**: the planet-motion arrow is yellow and labelled "planet moving this way" beside its tip.
- **Ready**: on load and after reset, before the first unpause, a centred message "Push up or down to pick a side, then press Space to go."
- **Crash**: when the sim status is `crashed`, a centred message "Bonk! You hit the planet. Press R to try again."
- **Result**: when the sim status is `departed`, a centred card with the final speed change: "Boost! +6.6 km/s" in green if `speedChange` is above +0.05, "Brake! −10.8 km/s" in red if below −0.05, otherwise "No change", plus "Fuel left: 70%" and "Press R to fly again." During the flyby the live `▲/▼` change keeps updating; the card is the result.
- **Help** (top right, small, right-aligned, clear of the time buttons at any width): "Arrows: push · Space: pause · 1 2 3: speed · R: restart".

The planet-frame speed is not displayed in this slice.

## Controls

| Input | Effect |
|---|---|
| Arrow keys (held) | Thrust in that screen direction (up = world `+y`, etc.). Held arrows form a stack: the most recently pressed one that is still held wins; releasing it falls back to the next one still held. |
| Space | Toggle pause. Unpausing returns to the setting that was active before the pause. |
| 1 / 2 / 3 | Slow / Normal / Fast (also unpauses) |
| R | Reset to the initial scenario: new sim state, cleared trail, paused in the ready state, time setting kept |
| Click a time button | Same as the matching key |

Key handling is on the window, so no element needs focus. Arrow keys and Space call `preventDefault`, so the page never scrolls and a focused button is never activated by Space; time buttons also drop focus after a click. When the window loses focus, all held arrows are released.

**Pause-and-plan.** While paused and the ship is flying, a held arrow applies a planning burn (`planningBurn`) each frame of `FUEL_DV / 3` km/s per real second, so a full tank takes 3 seconds of holding. Time stays frozen, the flame shows, the fuel bar drops, and the prediction line is recomputed that frame, so the player sees the new path immediately. This is the intended way to pick a side from the ready state.

The page starts **paused** in the ready state, with Normal as the setting it resumes to.

## Frame Loop

Each `requestAnimationFrame`:

1. Determine `thrustDir` from the held-arrow stack.
2. `{ steps, carry } = stepsForFrame(timeSetting, elapsedSeconds, carry)`.
3. `{ state, samples } = advance(state, steps, thrustDir)`; append `samples` to the trail.
4. If any steps ran (or after a reset), `prediction = predict(state)`. Otherwise keep the previous prediction.
5. Update the camera scale.
6. Draw background, star-direction arrow, trail, prediction line, planet, planet-motion arrow, ship (with flame if thrust was applied this frame), then readouts and any message.

## Visual Style

A dark navy background (`#0b1530`) with a sparse fixed starfield, bright flat shapes, and rounded sans-serif text (Nunito where available, else the system sans). The ship is a white rocket with a blue window, red fins and an orange flame. The planet is tan with darker and lighter bands and a small red spot. The prediction line is dashed bright cyan (`#22d3ee`); the trail is solid, faint white. No images are loaded; everything is drawn with canvas primitives.

The approved visual reference is the cockpit mockup canvas "Slingshot cockpit mockup" (frame: mid-flyby, passing behind).

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Camera frame | Planet-centred, drawn in the planet's frame | Star-frame view following the ship; fixed star-centred view | In the planet's frame the path is a clean, symmetrical bend and the planet stays put, which is easiest to steer by. A star-centred view at Jupiter's distance makes the flyby invisibly small. The star-frame gain is what the speed number shows. |
| Behind / in front cue | Planet-motion arrow, world `+y` drawn up | No cue; label the sides | One arrow is enough for "go behind it / go in front of it" and avoids text-heavy labels. |
| Zoom | Automatic, based on ship–planet distance | Manual zoom keys; fixed scale | Keeps ship and planet on screen with no extra control to learn. A fixed scale cannot show both the 4-million-km approach and a near-surface pass. |
| Ship near an inflated planet | Push the drawn ship out to the drawn edge plus 8 px | Rely on zoom alone | Zoom eases and can lag at Fast; the push-out guarantees the picture never shows a crash that didn't happen. |
| Start state | Paused with a "pick a side" prompt | Start running at Normal | From the start the ship must steer within seconds; starting paused gives a kid time to read the screen first. |
| Result moment | Card on `departed` | Only the live change readout | Star-frame speed swings by tens of km/s during the pass; the card gives one clear answer. |
| Planet drawn size | `max(true size, 24 px)` | Always inflated; always true | Inflated when far for visibility, true when close so the drawn edge never contradicts the crash radius. |
| Ship drawn size | Constant 12 px | True scale | A true-scale ship is far below a pixel. A constant size keeps the ship comparable to the planet on screen. |
| Thrust input | Four arrow keys, world axes | Rotate + thrust; mouse drag | No orientation concept to teach, and it maps directly onto "push up / push down". |
| Rendering | Canvas 2D, no libraries | WebGL; DOM/SVG | Enough for a handful of shapes and a few thousand line points per frame, with no dependencies. |
| Readouts | HTML elements over the canvas | Drawn on canvas | Crisp text and clickable buttons for free. |

## Open Questions & Future Decisions

### Deferred
1. Touch controls and mobile layout.
3. A debug overlay (planet-frame speed, closest-approach distance) behind a hidden key.
4. Whether to show the predicted post-flyby speed before the flyby happens.

## References

- `docs/high-level-design.md`
- `docs/intent/flight-sim/flight-sim-design.md` (state shape, `advance`, `predict`, readout functions)
