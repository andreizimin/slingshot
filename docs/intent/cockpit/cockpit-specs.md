# Cockpit — EARS Specs

Design: `cockpit-design.md` · Prefix: `COCKPIT`

Specs whose behaviour lives in the pure `site/cockpit/view.js` are covered by `tests/cockpit.test.js`. The rest are listed under **Verified by hand** at the end.

## Camera and drawing

- [x] **COCKPIT-CAM-001**: The cockpit shall draw every ship position (the live ship, each trail point and each prediction point) as that position minus the focus world's position at that position's own sim time, with world `+x` to screen right and world `+y` to screen up, and shall move the camera centre 12% of the remaining way toward the focus world each frame.
- [x] **COCKPIT-CAM-002**: The cockpit shall set the target scale so the ship-to-focus-world distance spans 35% of the canvas's smaller dimension, clamped between 1,000 and 20,000 km per CSS pixel, and shall move the current scale linearly 15% of the remaining way toward the target each frame, paused or running.
- [x] **COCKPIT-CAM-005**: The cockpit shall never set the target scale smaller than needed to keep the ship's drawn position at least 170 px below the top edge, 110 px above the bottom edge, and 110 px from each side (60 px on screens narrower than 600 px) so its speed arrows and labels fit.
- [x] **COCKPIT-CAM-003**: When the page loads or the player resets, the cockpit shall set the current scale directly to the target scale.
- [x] **COCKPIT-CAM-007**: While a tour card is shown, the cockpit shall treat the play area as the band between the top readouts (180 px from the top, 120 px on screens narrower than 600 px) and the card's top edge: the camera centre shall be drawn at the play area's centre, and the target scale (`COCKPIT-CAM-002`, `COCKPIT-CAM-005`) shall use the play area's height, the space from that centre up to 170 px from the canvas top, and the space from that centre down to 110 px above the card; otherwise the play area shall be the whole canvas.
- [x] **COCKPIT-CAM-004**: The cockpit shall fill the browser window with the canvas, resize it when the window resizes, and render at the device pixel ratio.

## Storybook proportions

- [x] **COCKPIT-DRAW-001**: The cockpit shall draw the ship as a 12 CSS-pixel rocket (white body, blue window, red fins) pointing along its planet-frame velocity, independent of zoom.
- [x] **COCKPIT-DRAW-002**: The cockpit shall draw every world in the scenario as a banded tan disc of radius `max(its radius / scale, 24)` CSS pixels at its current position.
- [x] **COCKPIT-DRAW-003**: Unless the sim status is `'crashed'`, the cockpit shall draw the ship through the same radial remap as the paths (COCKPIT-DRAW-010), so the ship always sits on its trail and never inside the drawn planet; a crashed ship is drawn at its true position. The sim state is unchanged.
- [x] **COCKPIT-DRAW-004**: The cockpit shall draw the ship pointing along its heading and, while throttle is above 0, an orange-and-yellow flame from its tail whose length grows with throttle.
- [x] **COCKPIT-DRAW-008**: While the ship is flying, the cockpit shall draw two speed arrows from the ship: a thin grey arrow (4 px per km/s) for the planet-frame speed toward (or away from) the planet, and a thick orange arrow (14 px per km/s, at least 30 px when non-zero) for the sideways speed, both starting just outside the ship body and labelled in km/s inside dark pills past their tips; while a sideways manoeuvre is queued, it shall also draw the sideways speed the plan will produce as a dashed arrow on top, labelled "(planned)".
- [x] **COCKPIT-DRAW-005**: The cockpit shall draw, beside each world, a yellow arrow along that world's velocity in the scenario's frame, labelled "planet moving this way" for the focus world; and, only in a scenario with a star, a Star badge: an arrow-shaped bubble with a small sun inside, its tip pointing toward the star, labelled "Star", placed on the screen edge where the line from the planet toward the star meets it (behind the ship at the start), kept clear of the top and bottom HUD bands.
- [x] **COCKPIT-DRAW-009**: The cockpit shall draw the dashed planned sideways arrow only while paused with a plan; while running it shall show only actual speeds, and it shall omit the sideways arrow and label when the sideways speed is under 0.05 km/s.
- [x] **COCKPIT-DRAW-010**: When drawing the trail or the prediction line, the cockpit shall draw each point at screen distance √(d² + K²) from the planet centre on its true bearing, where d is its true screen distance and K² = (drawn planet radius + 6 px)² − (true planet radius in px)² (zero when not inflated), so paths bend smoothly around the drawn planet instead of crossing it or hugging its edge; the sim state is unchanged.
- [x] **COCKPIT-TUNE-001**: Where the page URL contains `?tune`, the cockpit shall offer a speed tuner (hidden otherwise), opened from a round button at the bottom right, with sliders for the Slow, Normal and Fast steps-per-second values that apply immediately and display the current value.
- [x] **COCKPIT-DRAW-006**: The cockpit shall draw the prediction as a dashed cyan line and the trail as a faint solid white line, on a navy background with a fixed sparse starfield.

## Trail and prediction

- [x] **COCKPIT-TRAIL-001**: When `advance` returns samples, the cockpit shall append them to the trail, keeping only the most recent 3,000 points.
- [x] **COCKPIT-TRAIL-002**: When the player resets, the cockpit shall empty the trail.
- [x] **COCKPIT-PRED-001**: When a frame runs at least one sim step, or after a reset, the cockpit shall recompute the prediction from the current state; otherwise it shall reuse the previous prediction.
- [x] **COCKPIT-PRED-002**: The cockpit shall draw the prediction line only while paused (including the ready state); while running it shall not draw it.
- [x] **COCKPIT-PRED-003**: While the prediction line is shown, its dashes shall move along the path from the ship in the direction of travel (about 38 px per second) and its brightness shall pulse gently; where the browser asks for reduced motion, the line shall be drawn still and at full brightness.

## Readouts

- [x] **COCKPIT-HUD-001**: The cockpit shall show, top centre, the label "Your speed" above the ship's speed in the scenario's frame (the star's in the tutorial, the pond's in the level) in km/s to one decimal place.
- [x] **COCKPIT-HUD-002**: The cockpit shall show, below the speed, the speed change from the start as `▲ +x.x` in green when above +0.05 km/s, `▼ −x.x` in red when below −0.05 km/s, and grey otherwise.
- [x] **COCKPIT-HUD-003**: The cockpit shall show, top left, the label "Fuel" above a rounded bar filled to the remaining fraction of `FUEL_DV`, sky blue at 20% or more and red below 20%.
- [x] **COCKPIT-HUD-004**: The cockpit shall show, bottom centre, four buttons labelled Pause, Slow, Normal and Fast, each with a stroke icon, with the active setting filled cyan.
- [x] **COCKPIT-HUD-005**: The cockpit shall show, top right and right-aligned, the help line "Arrows: push · Space: pause · 1–4: pause/slow/normal/fast · R: restart".
- [x] **COCKPIT-HUD-006**: The cockpit shall not display planet-frame speed or other debug values.

## Messages

- [x] **COCKPIT-MSG-001**: While the game is in the ready state (after load or reset, before the first unpause), the cockpit shall show the centred message "Push up or down to pick a side, then press Space to go."
- [x] **COCKPIT-MSG-002**: While the sim status is `'crashed'`, the cockpit shall show the centred message "Bonk! You hit the planet. Press R to try again."
- [x] **COCKPIT-MSG-003**: While the sim status is `'departed'`, the cockpit shall show a centred result card with "Boost! +x.x km/s" in green if the speed change is above +0.05, "Brake! −x.x km/s" in red if below −0.05, otherwise "No change", plus "Fuel left: N%" and "Press R to fly again."

## Controls

- [x] **COCKPIT-CTL-001**: While one or more arrow keys are held, the cockpit shall pass the direction of the most recently pressed arrow still held to `advance` (Up → `'up'`, Down → `'down'`, Left → `'left'`, Right → `'right'`); while none are held it shall pass `null`.
- [x] **COCKPIT-CTL-002**: When the browser window loses focus, the cockpit shall release all held arrows.
- [x] **COCKPIT-CTL-003**: When the player presses Space, the cockpit shall toggle between paused and the time setting that was active before pausing.
- [x] **COCKPIT-CTL-004**: When the player presses 2, 3 or 4, or clicks Slow, Normal or Fast, the cockpit shall switch to that setting and unpause; when the player presses 1 or clicks Pause, the cockpit shall pause.
- [x] **COCKPIT-CTL-005**: When the player presses R, the cockpit shall replace the sim state with `initialState()`, empty the trail, pause in the ready state, and keep the setting to resume to.
- [x] **COCKPIT-CTL-006**: The cockpit shall listen for keys on the window, call `preventDefault` on arrow keys and Space, and remove focus from a time button after it is clicked.
- [x] **COCKPIT-CTL-008**: While paused with the sim status `'flying'` and a push direction held (arrow or drag), the cockpit shall apply `planningBurn` at `PLAN_RATE` km/s per real second (elapsed clamped to 0.25 s) to a separate planned state, leave the live state and its fuel unchanged, draw the flame, and recompute the prediction from the planned state.
- [x] **COCKPIT-CTL-011**: When the game resumes from pause with a planned state, the cockpit shall make the planned state the live state (charging its fuel); when the player resets, it shall discard the plan.
- [x] **COCKPIT-HUD-007**: While a plan exists, the fuel bar shall show the fuel left after the plan as the solid fill and the plan's cost as a striped section up to the current fuel.
- [x] **COCKPIT-CTL-007**: When the page loads, the cockpit shall start paused in the ready state with Normal as the setting to resume to.

- [x] **COCKPIT-CTL-009**: While a pointer (touch, mouse or pen) pressed on the canvas is more than 24 px from its press point, and no keyboard arrow is held, the cockpit shall use the vertical part of the drag as the push (drag up → `'up'`, drag down → `'down'`; horizontal movement is ignored, since only sideways speed can be changed), in both running and paused-planning modes.
- [x] **COCKPIT-CTL-010**: When the dragging pointer is released or cancelled, or the window loses focus, the cockpit shall stop the drag thrust.
- [x] **COCKPIT-DRAW-007**: While a drag is active, the cockpit shall draw a faint ring at the press point and an arrow from the press point to the pointer.

## Phones and touch screens

- [x] **COCKPIT-MOB-001**: The cockpit shall set `touch-action: none` on the game surface so touch drags never scroll or zoom the page.
- [x] **COCKPIT-MOB-002**: Where the primary pointer is coarse (touch-first device), the cockpit shall show the help line "Drag to push · buttons: speed" and the ready message "Drag up or down to pick a side, then tap Normal to go."
- [x] **COCKPIT-MOB-003**: Where the viewport is narrower than 600 px, the cockpit shall shrink the speed number to 40 px, narrow the fuel bar to 110 px, hide the help line, and fit all four time buttons on one row at least 44 px tall, with message cards no wider than the viewport minus 32 px.

## Frame loop

- [x] **COCKPIT-LOOP-001**: On each animation frame, the cockpit shall compute steps with `stepsForFrame` from the real time elapsed since the previous frame, call `advance` with that count and the current thrust direction, then draw.

## The level

- [x] **COCKPIT-CAM-006**: In the frame in which the focus world changes, the cockpit shall start drawing the whole trail, and the prediction line if one is shown, in the new focus world's frame, while the camera centre eases across per `COCKPIT-CAM-001`.
- [x] **COCKPIT-DRAW-011**: In the level, the cockpit shall draw each world's name in a small pill beside it.
- [x] **COCKPIT-DRAW-012**: In the level, the cockpit shall draw the destination's catch radius as a pulsing ring whose radius is the catch radius at true scale, but never under 30 px; and, while the destination's centre is off screen, an arrow at the screen edge pointing to it, labelled with its name and the distance from the ship to its centre in million km, rounded to one decimal place.
- [x] **COCKPIT-HUD-008**: In the level, while the ship is within the destination's catch radius, the cockpit shall show under the speed readout "Approach X.X km/s · need under 5", with X.X the far speed relative to the destination (`SIM-READ-003`) rounded to one decimal place, in green when that far speed is strictly under the level's catch speed.
- [x] **COCKPIT-MSG-004**: In the level, the cockpit shall show the level's ready and result cards (`LEVEL-007`, `LEVEL-008`) and none of the tutorial's messages, cards or checkpoints (the departed Boost/Brake card, the mid-swing checkpoint, the tour's captions), which shall appear only in the tutorial.
- [x] **COCKPIT-PRED-004**: The cockpit shall compute the prediction only while paused (when pausing, after a reset, and whenever the queued plan changes while paused), shall not draw any prediction while the game runs (`COCKPIT-PRED-002`), and shall use the scenario's prediction horizon.

## Verified by hand

These describe canvas drawing, browser input wiring and the frame loop in `site/cockpit/main.js` and `site/style.css`. `node --test` has no browser, so they are checked by playing the game on the dev site, on a desktop and a phone, before each merge:

- Camera and canvas: `COCKPIT-CAM-001`, `COCKPIT-CAM-003`, `COCKPIT-CAM-004`
- Drawing: `COCKPIT-DRAW-001`, `COCKPIT-DRAW-003`, `COCKPIT-DRAW-004`, `COCKPIT-DRAW-006`, `COCKPIT-DRAW-007`, `COCKPIT-DRAW-008`, `COCKPIT-DRAW-009`
- Trail and prediction: `COCKPIT-TRAIL-001`, `COCKPIT-TRAIL-002`, `COCKPIT-PRED-001`, `COCKPIT-PRED-003`
- Readouts: `COCKPIT-HUD-001`, `COCKPIT-HUD-004`, `COCKPIT-HUD-005`, `COCKPIT-HUD-006`
- Controls: `COCKPIT-CTL-001`, `COCKPIT-CTL-002`, `COCKPIT-CTL-003`, `COCKPIT-CTL-004`, `COCKPIT-CTL-005`, `COCKPIT-CTL-006`, `COCKPIT-CTL-007`, `COCKPIT-CTL-008`, `COCKPIT-CTL-010`, `COCKPIT-CTL-011`
- Phones: `COCKPIT-MOB-001`, `COCKPIT-MOB-003`
- Frame loop: `COCKPIT-LOOP-001`
- The level: `COCKPIT-CAM-006`, `COCKPIT-DRAW-011`, `COCKPIT-MSG-004`, `COCKPIT-PRED-004`
