// Getting-started tour: a guided walk through the real game. Pure data and rules, no DOM,
// so it runs under node --test. main.js moves the camera, shows the cards and feeds events in.

export const TOUR_DONE_KEY = 'slingshot.tourDone';

// focus: where the camera looks ('ship' or 'planet'); zoom: 'close' for the opening close-up.
// target: what is highlighted: a world thing ('ship', 'planet', 'arrows') or a HUD element id.
// advance: 'tap' (Next), 'planBehind' (a plan that passes behind the planet), 'running' (play pressed),
// 'end' (the flight's result; Done finishes the tour).
// @spec TOUR-001
export const STEPS = [
  {
    id: 'ship', focus: 'ship', zoom: 'close', target: 'ship', advance: 'tap', destination: true,
    title: 'This is your ship',
    text: "It's heading for a giant planet. Its destination is far beyond it, and it has nowhere near enough fuel to get there on its own.",
  },
  {
    id: 'planet', focus: 'planet', target: 'planet', advance: 'tap', destination: true,
    title: 'Borrow speed from the planet',
    text: 'The planet races around its star at 13 km/s. Swing close behind it and its gravity drags you along, lending you speed for free.',
  },
  {
    id: 'speed', focus: 'planet', target: 'hud-speed', advance: 'tap',
    title: 'Your speed',
    text: 'This is how fast you are flying. Your goal: make this number go up.',
  },
  {
    id: 'arrows', focus: 'planet', target: 'arrows', advance: 'tap',
    title: 'Two kinds of speed',
    text: 'Grey: your speed toward the planet. Gravity controls that one. Orange: your sideways speed. That is the one you steer.',
  },
  {
    id: 'fuel', focus: 'planet', target: 'hud-fuel', advance: 'tap',
    title: 'Fuel is scarce',
    text: 'Pushing sideways burns fuel. Spend a little early and it goes a long way.',
  },
  {
    id: 'plan', focus: 'planet', target: 'ship', advance: 'tap',
    title: 'Plan while paused',
    text: 'While the game is paused, drag up or down (or press ↑ ↓) to plan your course. The dashed line shows exactly where you will go. Planning is free.',
  },
  {
    id: 'try', focus: 'planet', target: 'ship', advance: 'planBehind',
    title: 'Your turn',
    text: 'Drag down until the dashed line swings around BEHIND the planet.',
    waiting: 'Keep going: the line has to pass behind the planet (the side it is moving away from).',
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
  },
  {
    id: 'result', focus: 'planet', target: 'hud-speed', advance: 'end',
    title: 'Boost!',
    text: '',
  },
];

export const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);

// @spec TOUR-002
export function shouldAutoStart(storage) {
  try {
    return storage?.getItem(TOUR_DONE_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markDone(storage) {
  try { storage?.setItem(TOUR_DONE_KEY, '1'); } catch { /* private mode: replay next visit */ }
}

export const start = () => ({ active: true, index: 0 });
export const current = (tour) => (tour?.active ? STEPS[tour.index] : null);

// Is the step's "move on" condition met right now? ctx: { planDv, predictionEnding, setting, status }.
// @spec TOUR-003
export function conditionMet(step, ctx) {
  switch (step.advance) {
    case 'tap': return true;
    case 'planBehind': return ctx.planDv < 0 && ctx.predictionEnding === 'departed';
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

// Steps that move on by themselves as soon as their condition holds (no Next press).
export const autoAdvances = (step) => step.advance === 'running';

// Advance one step; past the last step the tour ends.
export function next(tour) {
  if (!tour?.active) return tour;
  const index = tour.index + 1;
  return index >= STEPS.length ? { active: false, index: STEPS.length - 1, done: true } : { active: true, index };
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
      return { n, of, title: step.title, text: step.text, button: 'Keep flying', canAdvance: true, action: 'resume' };
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
        text: 'You flew into the planet. Plan a slightly wider swing behind it: drag down a little more.',
        button: 'Try again', canAdvance: true, action: 'retry',
      };
    }
    const change = ctx.change ?? 0;
    const gained = change > 0.05;
    return {
      n, of,
      title: gained ? 'Boost!' : 'Not quite',
      text: gained
        ? `The planet lent you ${signedKms(change)}, almost for free. Passing in FRONT of it slows you down instead. Try that next!`
        : `Your speed changed by ${signedKms(change)}. Passing behind the planet gives a boost. Press R and try a swing behind it.`,
      button: 'Done', canAdvance: true, action: 'finish',
    };
  }
  const ok = conditionMet(step, ctx);
  let text = step.text;
  if (step.id === 'try' && tour.crashed) text = `Too close! ${text} A little wider this time.`;
  if (step.id === 'try' && !ok && ctx.planDv < 0) text = step.waiting;
  return {
    n, of, title: step.title, text,
    button: step.advance === 'tap' || step.advance === 'planBehind' ? 'Next' : null,
    canAdvance: step.advance === 'tap' || (step.advance === 'planBehind' && ok),
    action: 'next',
  };
}

export const signedKms = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} km/s`;

// While the tour is on a step, which game inputs are allowed.
// @spec TOUR-006
export function inputAllowed(step, kind) {
  if (!step) return true;
  if (kind === 'push') return step.id === 'try' || step.id === 'fly';
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
  if (ctx.status === 'departed') return 'finish';
  return null;
}
