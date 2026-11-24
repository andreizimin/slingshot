# CO-003: Onboarding that stays out of the way, and a choice at the door

| | |
|---|---|
| Type | Feature |
| Status | Done |
| Requested | 2026-11-24 |
| Approved | 2026-11-24 |
| Completed | 2026-11-24 |
| Ticket | [ZZF-93](https://linear.app/zizify-workshop/issue/ZZF-93), [ZZF-90](https://linear.app/zizify-workshop/issue/ZZF-90) |

## Request

- ZZF-93 (Admin, 950×697): "all the onboarding bubble text is overlaying the actual layout - hard to see, doesn't look pretty. Also, should ask the user to go for tutorial or try a sample mission"
- ZZF-90 (player, 1316×809): "i don't like interactive onboardings. step 7 overlaps the vector"

## Intent

Today every load drops the player straight into a 10-step tutorial whose cards are positioned absolutely over the game, so on mid-size screens they cover the thing they point at (step 7 "Your turn" covers the ship's speed arrows and the line being planned). Two players disliked it. The game should open on a short start screen that lets the player choose the tutorial or a sample mission, and tutorial cards should never cover their target or the planning line.

## Predicted Impact

Assumes the recommended answers below (start screen with two choices; cards docked in a reserved strip; tutorial kept interactive but shorter).

### HLD

User-flow section: the front door becomes a start screen (Tutorial · Sample mission), not the tutorial itself. No tenet changes.

### LLDs

| Component | Section | Change |
|---|---|---|
| `tour` | When It Shows | Tutorial starts from the start screen or the ? button, not on every load. |
| `tour` | Camera, Card and Highlights | Cards dock to a fixed strip (bottom on desktop, above the time buttons on phones) and the camera frames the target in the space left over; no card is placed over the world. |
| `tour` | Script | Steps 3–6 merged into two ("Your speed and its two arrows", "Fuel, and planning is free"), 10 → 8 steps. |
| `cockpit` | Layout | New start-screen overlay; the play area shrinks by the card strip while a card shows. |
| `analytics` | Events | `slingshot_start_choice` (`tutorial` / `mission`). |

### Specs

| ID | Action | Text (new or revised) |
|---|---|---|
| `TOUR-001` | Revise | Eight steps (ship, planet, speed+arrows, fuel+plan, try, fly, swing, result). |
| `TOUR-002` | Revise | When the page loads, the cockpit shall show the start screen offering Tutorial and Sample mission; ? shall start the tutorial from step 1. |
| `TOUR-004` | Revise | The caption card shall be docked in the card strip, never over the play area. |
| `TOUR-007` | Revise | The camera shall frame each step's target inside the play area left by the card strip. |
| `TOUR-013` | Revise | Skip tour shall return to the start screen (or lead into the mission, per decision 3). |
| `TOUR-015` | Add | When Sample mission is chosen, the cockpit shall start the CO-002 level with every control live and no tutorial. |
| `TOUR-016` | Add | While a card is shown, its rectangle shall not intersect the ship, its speed arrows, or the prediction line's first N px. (Layout check, verified by hand.) |
| `ANA-0xx` | Add | `slingshot_start_choice` event. |
| `TOUR-006`, `TOUR-012` | Revise | Renumbered step ranges. |

### Tests

| File | Action | Specs covered |
|---|---|---|
| `tests/tour.test.js` | Change | TOUR-001, 002, 006, 012, 013, 015 |
| `tests/analytics.test.js` | Change | new ANA event |

### Code

| File | Action | What changes |
|---|---|---|
| `site/cockpit/tour.js` | Change | 8-step script, start-screen state, choice handling |
| `site/cockpit/main.js` | Change | start screen, play-area inset while a card shows, camera framing |
| `site/index.html` | Change | start-screen markup, card strip |
| `site/style.css` | Change | drop per-anchor absolute card positions; strip layout; start screen |
| `site/cockpit/analytics.js` | Change | new event |

### Other

Development log entry.

## Cross-Segment Effects

- **CO-002 (in progress) dependency:** "Sample mission" is the level CO-002 builds. CO-003 must land after CO-002, or decision 1 falls back to "free flight" as the mission.
- **cockpit:** the camera gains a play-area inset; non-tour play is unaffected.
- **analytics:** one new event.

## Decisions Needed

None open. Decided on 2026-11-24: 1a, 2a, 3a, 4a. CO-004 (ZZF-91) is delivered in this change order: the code shows the cause is step 6 locking steering while its caption asks the player to drag.

1. **What the door offers.** (a, recommended) A start screen: **Tutorial** · **Sample mission**, every load. (b) Start screen only on the first visit, remembered on the device (breaks the "nothing stored" rule). (c) Keep auto-tutorial, add a "Skip to mission" button on card 1.
2. **Card placement.** (a, recommended) Docked strip with the camera reframed into the remaining space. (b) Keep floating cards, but auto-place them on the side away from the target. (c) Minimal: fix only step 7's overlap.
3. **ZZF-90 "don't like interactive onboardings".** (a, recommended) Keep the hands-on ending (it is what teaches the boost) but cut 10 → 8 steps and offer the choice so nobody is forced through it. (b) Replace with a non-interactive explainer (3 static panels / short animation) then straight into the mission. (c) No script change.
4. **Ordering with CO-002.** (a, recommended) Do after CO-002 merges. (b) Do now, with free flight as the "sample mission" placeholder.

## Risks and Edge Cases

- Shrinking the play area on a 950×697 viewport may leave the planet and ship too small; check both viewports from the tickets (950×697, 1316×809) and a phone.
- Step renumbering ripples through gating, Back and R rules; tests must enumerate them.

## Verification

Unit tests for the script and choice; by hand on dev at 950×697, 1316×809 and a phone, every step, confirming no card covers its target or the planning line.

---

## Outcome

### Predicted vs Actual

| Level | Predicted | Actual | Notes |
|---|---|---|---|
| HLD | 1 change | 1 change | The tour's row now names the start screen. |
| LLDs | 5 sections (tour ×3, cockpit, analytics) | 6 sections (tour ×4, cockpit, analytics) + 1 line in `level` | `level`'s "Entering" gained Sample mission, a cascade not predicted. |
| Specs | +3 ~9 | +4 ~6 | Added TOUR-015, TOUR-016, COCKPIT-CAM-007, ANA-008 (the play area needed its own cockpit spec). Revised TOUR-001, 002, 004, 006, 007, 012. TOUR-013 was not revised: Skip tour still leads to the level, as it already did after CO-002. |
| Tests | 2 files | 2 files | `tests/tour.test.js`, `tests/cockpit.test.js`; 4 new tests, 6 changed. |
| Code | 5 files | 5 files | `tour.js`, `main.js`, `view.js`, `index.html`, `style.css`. `analytics.js` was predicted but untouched: the event builder lives in `view.js` like the others. |

### Surprises

- **The play area has a top too.** Docking the card shrank the play area from below, and centring the camera in what was left pushed the ship and the planet's motion arrow into the speed readout at 950×697. The play area now runs from below the top readouts (180 px; 120 on phones) to the card. Found by playing it in a browser, not by the tests.
- **The feedback button overlaps the strip on phones.** The shared widget sits just above the time buttons, so on narrow screens the strip is lifted 52 px higher.
- **Tight screens stay tight.** At 950×641 the planned sideways label on "Your turn" touches the card's top edge; the arrow itself stays clear. Acceptable for now; worth watching in play-testing.
- **ZZF-91 needed no reproduction.** The code showed the cause directly: step 6 said "drag to plan" while steering was locked until step 7.

### Commits

| Hash | Message |
|---|---|
| `4738221` | CO-003, CO-004: change orders (ZZF-93, ZZF-90, ZZF-91) |
| (this commit) | CO-003: start screen, docked tour card, 8-step tutorial, steering on the planning step |

### Measurements

| | |
|---|---|
| Tests before → after | unit 108 → 112 |
| Lines changed | +141 −61 (code), +61 −9 (tests), +33 −27 (docs, excluding change orders) |
| Agent time | about 1.5 hours |
| Deployed | dev on push; production on merge |
