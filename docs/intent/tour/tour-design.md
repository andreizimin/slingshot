---
parent: high-level-design
prefix: TOUR
---

# Getting-Started Tour

## Context and Design Philosophy

A first-time player meets an unfamiliar idea (borrowing speed from a moving planet) and an unfamiliar control scheme (plan while paused, steer only sideways). The tour explains both on the real game, not on a separate screen: the game stays frozen, the camera moves to each thing in turn, a caption pops up beside it, and the player taps to continue. The last three steps hand over the controls: the player plans a pass behind the planet, presses play, and sees the boost they earned. It is the same pattern as learn-mandalorian's intro (a short, tap-paced script shown once, replayable), told with the game itself.

The tour is its own component. Its steps, words and rules live in the pure `site/cockpit/tour.js` (no DOM, unit-tested); `main.js` moves the camera, draws highlights and shows the card.

## Script

| # | Step | Camera and highlight | Moves on when |
|---|---|---|---|
| 1 | **This is your ship**: heading for a giant planet; its destination is far beyond, and it has nowhere near enough fuel to get there alone. | Close-up on the ship; a story-only "Destination: far away" marker at the right edge | Next |
| 2 | **Borrow speed from the planet**: it races around its star at 13 km/s; swing close behind it and its gravity lends you speed for free. | Planet, with its motion arrow; destination marker still shown | Next |
| 3 | **Your speed**: make this number go up. | Speed readout | Next |
| 4 | **Two kinds of speed**: grey toward the planet (gravity's), orange sideways (yours to steer). | Ring around the ship's arrows; a zero-length sideways label shows where the orange arrow lives | Next |
| 5 | **Fuel is scarce**: pushing sideways burns it; a little early goes a long way. | Fuel bar | Next |
| 6 | **Plan while paused**: drag or ↑ ↓ to plan; the dashed line shows exactly where you will go; planning is free. | Ship | Next |
| 7 | **Your turn: pick a side**: drag down to swing behind the planet (speeds you up) or up to pass in front (slows you down), until the line clears the planet. | Ship; steering is now live | Any plan whose prediction ends in a departure; then Next |
| 8 | **Fly!**: press Normal or Space; try Slow near the planet. | Time buttons; play is now live | Play starts (moves on by itself; the card hides while flying) |
| 9 | **How the slingshot works** (mid-flight checkpoint): the planet's gravity bends your path; because it is moving, it drags you along as you swing behind it, or tugs you backwards as you cross in front of it, so that side slows you down. | The game pauses itself just after the closest approach; ring around the ship's arrows | Keep flying |
| 10 | **Boost!** (behind sped you up by x) or **Brake!** (in front slowed you down by x; this side slows you down, handy for arriving without overshooting). | Speed readout | I'm ready (into free flight), or Try the other side |

If the tour flight crashes, the result card becomes **Bonk! Too close** with **Try again**, which resets the flight and returns to step 7 with a "too close, a little wider" note. If the flight ends without a gain, the result card says **Not quite** and points back to passing behind.

The destination exists only in the story for now; real destinations arrive with the lily-pond map slice.

## When It Shows

- **Every load:** the tutorial is the game's front door. It always starts from step 1, the same way, on every visit; nothing is stored on the device.
- **The way out:** after a successful boost, the last card's button is **I'm ready**. It ends the tutorial and starts **free flight**: the same scenario with every control live and no captions, plus a small "Free flight · full game coming soon" note. Free flight stands in for the main game; when that exists, I'm ready will lead there instead. A flight with no gain, or a crash, offers **Try again** instead.
- **Skip:** every card has **Skip tour**, which also starts free flight.
- **Replay:** a round **?** button at the top right ("How to play") resets the flight and starts the tutorial from step 1.

## Input During the Tour

The tour teaches one control at a time, so each step allows only what it teaches:

- Steps 1–6: no steering and no play; Next (button, Enter or Space) advances.
- Step 7: steering (keys and drag) becomes live; play does not.
- Step 8: play (buttons, Space, 2–4) becomes live.
- Step 9: R restarts and ends the tour.

Pause is always allowed. While the tour runs, the normal centred messages (ready, result, crash) are replaced by the tour card.

## Camera, Card and Highlights

- **Camera.** Normally centred on the planet. During step 1 it centres on the ship at a close-up scale of 300 km/px; on step 2 it eases back to the planet and the normal zoom. The camera centre and scale both ease, so the move reads as one shot.
- **Card.** A dark card with a yellow border: step count, Skip tour, a title, one or two sentences, and Next / Try again / Done. On desktop it sits under the speed readout, beside the fuel bar, above the time buttons, or beside the ship or planet, kept on screen. On phones it docks full-width above the time buttons.
- **Highlights.** HUD targets glow with a pulsing yellow outline; world targets (ship, planet, arrows) get a pulsing dashed yellow ring.
- **Reduced motion.** The card's pop-in and the glow pulse are turned off.

## Analytics

`slingshot_tour_start` (`auto`: 1 on first visit, 0 on replay), `slingshot_tour_complete` (`change`: the tour flight's speed change), `slingshot_tour_skip` (`step`: where it was skipped). Counts only, as in `analytics`.

## Decisions & Alternatives

| Decision | Chosen | Alternatives Considered | Rationale |
|---|---|---|---|
| Where it plays | On the live game, frozen, with a moving camera | A separate intro screen; a video | Explaining on the real screen means every caption points at the thing the player will use next. |
| Pacing | Tap to continue | Timed captions | Kids read at different speeds; the same pattern as learn-mandalorian's intro. |
| Hands-on ending | Plan a pass behind, fly it, see the boost | Explain only | Doing it once is what makes the idea stick, and the boost is the reward. |
| Input gating | Only the control each step teaches | Everything live | A kid pressing Normal on step 2 would fly off before learning to plan. |
| Destination | Story only | A real target now | The game has no destinations yet; the marker sets up the lily-pond slice without new rules. |
| Logic location | Pure `tour.js` | Inside `main.js` | The steps and rules are testable without a browser. |

## Open Questions & Future Decisions

### Deferred
1. A second short tour for passing in front (the brake), once players ask.
2. Real destinations from the lily-pond map slice would turn the story marker into a goal.

## References

- learn-mandalorian `docs/intent/intro/intro-design.md` (the pattern)
- `docs/intent/cockpit/cockpit-design.md`, `docs/intent/analytics/analytics-design.md`
