// Getting-started tour: a guided walk through the real game. Pure data and rules, no DOM,
// so it runs under node --test. main.js moves the camera, shows the cards and feeds events in.


// focus: where the camera looks ('ship' or 'planet'); zoom: 'close' for the opening close-up.
// target: what is highlighted: a world thing ('ship', 'planet', 'arrows') or a HUD element id.
// advance: 'tap' (Next), 'planSide' (a plan that clears the planet on either side), 'running'
// (play pressed), 'resume' (the mid-swing checkpoint), 'end' (the flight's result).
// @spec TOUR-001
// @spec TOUR-002 — start() is where Tutorial and the ? button both begin.
export const STEPS = [
  {
    id: 'ship', focus: 'ship', zoom: 'close', target: 'ship', advance: 'tap', destination: true,
    title: 'This is your ship',
    text: "It's heading for a giant planet. Its destination is far beyond it, and it has nowhere near enough fuel to get there on its own.",
  },
  {
    id: 'planet', focus: 'planet', target: 'planet', advance: 'tap', destination: true,
    title: 'Borrow speed from the planet',
    text: 'The planet races around its star at 13 km/s. Swing close behind it and its gravity drags you along, lending you speed for free. Pass in front of it, and it slows you down instead.',
  },
  {
    id: 'speed', focus: 'planet', target: 'hud-speed', ring: 'arrows', advance: 'tap',
    title: 'Your speed',
    text: 'This is how fast you are flying: the planet can push it up, or pull it down. Grey arrow: your speed toward the planet, which gravity controls. Orange arrow: your sideways speed, the one you steer.',
  },
  {
    id: 'plan', focus: 'planet', target: 'hud-fuel', advance: 'tap',
    title: 'Fuel, and planning is free',
    text: 'Pushing sideways burns fuel, so a little early goes a long way. While paused, drag up or down (or press ↑ ↓) to plan: the dashed line shows exactly where you will go. Planning costs nothing until you fly.',
  },
  {
    id: 'try', focus: 'planet', target: 'ship', advance: 'planSide',
    title: 'Your turn: pick a side',
    text: 'Drag DOWN to swing BEHIND the planet (that speeds you up), or UP to pass in FRONT of it (that slows you down). Stop when the dashed line clears the planet.',
    waiting: 'Keep going: that path still hits the planet. Drag a little further.',
  },
  {
    id: 'fly', focus: 'planet', target: 'hud-time', advance: 'running',
    title: 'Fly!',
    text: 'Press Normal (or Space) to fly your plan. Try Slow near the planet to watch the slingshot happen.',
  },
  {
    id: 'swing', focus: 'planet', target: 'arrows', advance: 'resume',
    title: 'How the slingshot works',
    text: "The planet's gravity pulls you toward it. That pull is what bends your path around it. But the planet is moving, so as you swing around behind it, its pull drags you along with it, like being flung by a spinning carousel. That is where your extra speed comes from.",
    textFront: "The planet's gravity pulls you toward it. That pull is what bends your path around it. But the planet is moving, and you are crossing in FRONT of it, so its pull tugs you backwards, against your motion. This side of the planet slows you down.",
  },
  {
    id: 'result', focus: 'planet', target: 'hud-speed', advance: 'end',
    title: 'Boost!',
    text: '',
  },
];

export const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);

// The start screen: every load opens here, offering the tutorial or the level.
// @spec TOUR-015
export const DOOR = {
  title: 'Slingshot',
  text: "Borrow speed from planets to reach places your fuel can't.",
  choices: [
    { id: 'tutorial', label: 'Tutorial' },
    { id: 'mission', label: 'Sample mission' },
  ],
};
// On the start screen only Enter acts (it chooses Tutorial); steering, play and R do nothing.
export const doorKey = (key) => (key === 'Enter' ? 'tutorial' : null);

// The card strip: centred above the time buttons, at most 640 px wide, 16 px from each side.
// Returns the card's left edge, width and bottom edge in px (timeTop = top of the time buttons).
// @spec TOUR-016
export function cardStrip(W, timeTop) {
  const width = Math.min(640, W - 32);
  return { left: Math.round((W - width) / 2), width, bottom: timeTop - (W < 600 ? 68 : 16) };
}

export const start = () => ({ active: true, index: 0 });
export const current = (tour) => (tour?.active ? STEPS[tour.index] : null);

// Is the step's "move on" condition met right now? ctx: { planDv, predictionEnding, setting, status }.
// @spec TOUR-003
export function conditionMet(step, ctx) {
  switch (step.advance) {
    case 'tap': return true;
    case 'planSide': return ctx.planDv !== 0 && ctx.predictionEnding === 'departed';
    case 'running': return ctx.setting !== 'paused';
    case 'end': return ctx.status === 'departed';
    default: return false;
  }
}

// The mid-swing checkpoint fires once the ship has just passed its closest point to the planet
// on a close pass. ctx: { distance, closest } in km (planet-relative).
// @spec TOUR-011
export const SWING_MAX_CLOSEST = 2.0e6;
export function swingCheckpointDue(tour, ctx) {
  const step = current(tour);
  if (!step || step.id !== 'swing' || tour.swingShown) return false;
  return ctx.closest < SWING_MAX_CLOSEST && ctx.distance > ctx.closest * 1.0001;
}

// Which side of the planet a plan takes: pushing down (negative) passes behind, up passes in front.
// @spec TOUR-014
export const sideOf = (planDv) => (planDv < 0 ? 'behind' : planDv > 0 ? 'front' : null);

// Steps that move on by themselves as soon as their condition holds (no Next press).
export const autoAdvances = (step) => step.advance === 'running';

// Advance one step; past the last step the tour ends.
export function next(tour) {
  if (!tour?.active) return tour;
  const index = tour.index + 1;
  if (index >= STEPS.length) return { active: false, index: STEPS.length - 1, done: true };
  // Keep the side chosen at launch, so the checkpoint and result can explain it.
  return tour.side ? { active: true, index, side: tour.side } : { active: true, index };
}

// Going back one step: allowed on any step before the flight's checkpoint and result.
// @spec TOUR-012
export function canGoBack(tour) {
  const step = current(tour);
  return !!step && tour.index > 0 && step.id !== 'swing' && step.id !== 'result';
}
export function prev(tour) {
  if (!canGoBack(tour)) return tour;
  return { active: true, index: tour.index - 1 };
}

// A crash during the tour sends the player back to "Your turn" with a note on why.
// @spec TOUR-005
export const afterCrash = () => ({ active: true, index: stepIndex('try'), crashed: true });

// Is the card shown right now? The result card waits for the flight to end; others show while paused.
// @spec TOUR-004
export function cardVisible(step, ctx) {
  if (!step) return false;
  if (step.id === 'result' || step.id === 'swing') {
    return ctx.status === 'departed' || ctx.status === 'crashed' || ctx.setting === 'paused';
  }
  return ctx.setting === 'paused';
}

// The card's words and button for the current step and situation.
// @spec TOUR-001, TOUR-003, TOUR-005
export function cardFor(tour, ctx) {
  const step = current(tour);
  if (!step) return null;
  const n = tour.index + 1;
  const of = STEPS.length;
  if (step.id === 'swing') {
    if (tour.swingShown) {
      const text = tour.side === 'front' ? step.textFront : step.text;
      return { n, of, title: step.title, text, button: 'Keep flying', canAdvance: true, action: 'resume' };
    }
    return {
      n, of, title: 'Paused',
      text: 'Press Normal or Space to keep flying and see what the planet does.',
      button: null, canAdvance: false, action: 'none',
    };
  }
  if (step.id === 'result') {
    if (ctx.status === 'flying') {
      // Paused mid-flight on the tour: say how to carry on (steering is locked until the result).
      return {
        n, of, title: 'Paused',
        text: 'Press Normal or Space to keep flying and see what the planet does.',
        button: null, canAdvance: false, action: 'none',
      };
    }
    if (ctx.status === 'crashed') {
      return {
        n, of, title: 'Bonk! Too close',
        text: 'You flew into the planet. Plan a slightly wider swing: drag a little further.',
        button: 'Try again', canAdvance: true, action: 'retry',
      };
    }
    const change = ctx.change ?? 0;
    if (change > 0.05) {
      return {
        n, of, title: 'Boost!',
        text: `Passing BEHIND the planet sped you up by ${signedKms(change)}, almost for free. Passing in front would have slowed you down. You know how slingshots work now.`,
        button: "I'm ready", canAdvance: true, action: 'ready',
        secondary: 'Try the other side', secondaryAction: 'other',
      };
    }
    if (change < -0.05) {
      return {
        n, of, title: 'Brake!',
        text: `Passing in FRONT of the planet slowed you down by ${signedKms(Math.abs(change)).slice(1)}. This side slows you down, which is handy for arriving at a planet without overshooting it. Passing behind speeds you up.`,
        button: "I'm ready", canAdvance: true, action: 'ready',
        secondary: 'Try the other side', secondaryAction: 'other',
      };
    }
    return {
      n, of, title: 'Not much changed',
      text: `Your speed changed by only ${signedKms(change)}. Swing closer to the planet: behind it to speed up, in front of it to slow down.`,
      button: 'Try again', canAdvance: true, action: 'retry',
    };
  }
  const ok = conditionMet(step, ctx);
  let text = step.text;
  if (step.id === 'try' && tour.crashed) text = `Too close! ${text} A little wider this time.`;
  if (step.id === 'try' && tour.otherSide) text = `Now try the other side! ${text}`;
  if (step.id === 'try' && !ok && ctx.planDv !== 0) text = step.waiting;
  return {
    n, of, title: step.title, text,
    button: step.advance === 'tap' || step.advance === 'planSide' ? 'Next' : null,
    canAdvance: step.advance === 'tap' || (step.advance === 'planSide' && ok),
    action: 'next',
  };
}

export const signedKms = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} km/s`;

// While the tour is on a step, which game inputs are allowed.
// @spec TOUR-006
export function inputAllowed(step, kind) {
  if (!step) return true;
  if (kind === 'push') return step.id === 'plan' || step.id === 'try' || step.id === 'fly';
  if (kind === 'time') return step.id === 'fly' || step.id === 'swing' || step.id === 'result';
  return true;
}

// What R does: outside the tour, a plain restart. On the tour it acts only once a result card is
// up: after a crash it is "Try again", after a departure it finishes the tour; mid-flight, nothing.
// @spec TOUR-006
export function resetAction(step, ctx) {
  if (!step) return 'restart';
  if (step.id !== 'result') return null;
  if (ctx.status === 'crashed') return 'retry';
  if (ctx.status === 'departed') return Math.abs(ctx.change) > 0.05 ? 'ready' : 'retry';
  return null;
}
