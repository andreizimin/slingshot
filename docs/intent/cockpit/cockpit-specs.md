# Cockpit — EARS Specs

Design: `cockpit-design.md` · Prefix: `COCKPIT`

## Camera and drawing

- [ ] **COCKPIT-CAM-001**: The cockpit shall draw every ship position (live ship, trail, prediction) as the ship's position minus the planet's position at the same sim time, with the planet fixed at the canvas centre, world `+x` to screen right and world `+y` to screen up.
- [ ] **COCKPIT-CAM-002**: While the game runs, the cockpit shall set the target scale so the ship-to-planet distance spans 35% of the canvas's smaller dimension, clamped between 1,000 and 20,000 km per CSS pixel, and move the current scale 15% of the way toward the target each frame.
- [ ] **COCKPIT-CAM-005**: The cockpit shall never set the target scale smaller than needed to keep the ship's drawn position at least 170 px below the top edge, 110 px above the bottom edge, and 40 px from each side.
- [ ] **COCKPIT-CAM-003**: When the page loads or the player resets, the cockpit shall set the current scale directly to the target scale.
- [ ] **COCKPIT-CAM-004**: The cockpit shall fill the browser window with the canvas, resize it when the window resizes, and render at the device pixel ratio.

## Storybook proportions

- [ ] **COCKPIT-DRAW-001**: The cockpit shall draw the ship as a 12 CSS-pixel rocket (white body, blue window, red fins) pointing along its planet-frame velocity, independent of zoom.
- [ ] **COCKPIT-DRAW-002**: The cockpit shall draw the planet as a banded tan disc of radius `max(PLANET_RADIUS / scale, 24)` CSS pixels.
- [ ] **COCKPIT-DRAW-003**: While the sim status is `'flying'`, if the ship's drawn centre would fall within the drawn planet radius plus 8 px of the planet centre, then the cockpit shall draw the ship on the same bearing at exactly the drawn planet radius plus 8 px, without changing the sim state.
- [ ] **COCKPIT-DRAW-004**: While thrust is applied in the current frame, the cockpit shall draw an orange flame on the ship's side opposite the thrust direction.
- [ ] **COCKPIT-DRAW-005**: The cockpit shall draw a yellow arrow pointing screen-up from beside the planet with the label "planet moving this way", and a grey arrow at the left screen edge labelled "Sun".
- [ ] **COCKPIT-DRAW-006**: The cockpit shall draw the prediction as a dashed cyan line and the trail as a faint solid white line, on a navy background with a fixed sparse starfield.

## Trail and prediction

- [ ] **COCKPIT-TRAIL-001**: When `advance` returns samples, the cockpit shall append them to the trail, keeping only the most recent 3,000 points.
- [ ] **COCKPIT-TRAIL-002**: When the player resets, the cockpit shall empty the trail.
- [ ] **COCKPIT-PRED-001**: When a frame runs at least one sim step, or after a reset, the cockpit shall recompute the prediction from the current state; otherwise it shall reuse the previous prediction.

## Readouts

- [ ] **COCKPIT-HUD-001**: The cockpit shall show, top centre, the label "Your speed" above the star-frame speed in km/s to one decimal place.
- [ ] **COCKPIT-HUD-002**: The cockpit shall show, below the speed, the speed change from the start as `▲ +x.x` in green when above +0.05 km/s, `▼ −x.x` in red when below −0.05 km/s, and grey otherwise.
- [ ] **COCKPIT-HUD-003**: The cockpit shall show, top left, the label "Fuel" above a rounded bar filled to the remaining fraction of `FUEL_DV`, sky blue at 20% or more and red below 20%.
- [ ] **COCKPIT-HUD-004**: The cockpit shall show, bottom centre, four buttons labelled Pause, Slow, Normal and Fast, each with a stroke icon, with the active setting filled cyan.
- [ ] **COCKPIT-HUD-005**: The cockpit shall show, top right and right-aligned, the help line "Arrows: push · Space: pause · 1 2 3: speed · R: restart".
- [ ] **COCKPIT-HUD-006**: The cockpit shall not display planet-frame speed or other debug values.

## Messages

- [ ] **COCKPIT-MSG-001**: While the game is in the ready state (after load or reset, before the first unpause), the cockpit shall show the centred message "Push up or down to pick a side, then press Space to go."
- [ ] **COCKPIT-MSG-002**: While the sim status is `'crashed'`, the cockpit shall show the centred message "Bonk! You hit the planet. Press R to try again."
- [ ] **COCKPIT-MSG-003**: While the sim status is `'departed'`, the cockpit shall show a centred result card with "Boost! +x.x km/s" in green if the speed change is above +0.05, "Brake! −x.x km/s" in red if below −0.05, otherwise "No change", plus "Fuel left: N%" and "Press R to fly again."

## Controls

- [ ] **COCKPIT-CTL-001**: While one or more arrow keys are held, the cockpit shall pass the direction of the most recently pressed arrow still held to `advance` (Up → `'up'`, Down → `'down'`, Left → `'left'`, Right → `'right'`); while none are held it shall pass `null`.
- [ ] **COCKPIT-CTL-002**: When the browser window loses focus, the cockpit shall release all held arrows.
- [ ] **COCKPIT-CTL-003**: When the player presses Space, the cockpit shall toggle between paused and the time setting that was active before pausing.
- [ ] **COCKPIT-CTL-004**: When the player presses 1, 2 or 3, or clicks Slow, Normal or Fast, the cockpit shall switch to that setting and unpause; when the player clicks Pause, the cockpit shall pause.
- [ ] **COCKPIT-CTL-005**: When the player presses R, the cockpit shall replace the sim state with `initialState()`, empty the trail, pause in the ready state, and keep the setting to resume to.
- [ ] **COCKPIT-CTL-006**: The cockpit shall listen for keys on the window, call `preventDefault` on arrow keys and Space, and remove focus from a time button after it is clicked.
- [ ] **COCKPIT-CTL-008**: While paused with the sim status `'flying'` and an arrow held, the cockpit shall call `planningBurn` each frame with `FUEL_DV / 3` km/s per real second of elapsed time (elapsed clamped to 0.25 s), draw the flame, and recompute the prediction that frame.
- [ ] **COCKPIT-CTL-007**: When the page loads, the cockpit shall start paused in the ready state with Normal as the setting to resume to.

## Frame loop

- [ ] **COCKPIT-LOOP-001**: On each animation frame, the cockpit shall compute steps with `stepsForFrame` from the real time elapsed since the previous frame, call `advance` with that count and the current thrust direction, then draw.
