import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as tour from '../site/cockpit/tour.js';
import * as sim from '../site/sim/physics.js';

const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');
const paused = { planDv: 0, predictionEnding: 'crashed', setting: 'paused', status: 'flying', change: 0 };
const at = (id, extra = {}) => ({ active: true, index: tour.stepIndex(id), ...extra });

// @spec TOUR-001
test('the tour has the eight storyboard steps in order, opening on a close-up of the ship', () => {
  assert.deepEqual(tour.STEPS.map((s) => s.id), ['ship', 'planet', 'speed', 'plan', 'try', 'fly', 'swing', 'result']);
  const first = tour.STEPS[0];
  assert.equal(first.focus, 'ship');
  assert.equal(first.zoom, 'close');
  assert.match(first.text, /planet/);
  assert.match(first.text, /fuel/);
  assert.match(first.text, /destination/i);
  for (const s of tour.STEPS.slice(0, -1)) assert.ok(s.title && s.text, `${s.id} has words`);
  assert.equal(tour.STEPS.find((s) => s.id === 'speed').target, 'hud-speed');
  const speed = tour.STEPS.find((s) => s.id === 'speed');
  assert.match(speed.title, /Your speed/);
  assert.match(speed.text, /Grey/);
  assert.match(speed.text, /Orange/);
  const plan = tour.STEPS.find((s) => s.id === 'plan');
  assert.equal(plan.title, 'Fuel, and planning is free');
  assert.equal(plan.target, 'hud-fuel');
  assert.match(plan.text, /fuel/i);
  assert.match(plan.text, /dashed line/);
  assert.equal(tour.STEPS.find((s) => s.id === 'fly').target, 'hud-time');
});

// @spec TOUR-002
test('the tutorial starts from Tutorial on the start screen, and a ? button replays it', () => {
  assert.equal(tour.DOOR.choices.find((c) => c.id === 'tutorial').label, 'Tutorial');
  assert.deepEqual(tour.start(), { active: true, index: 0 });
  assert.match(html, /id="tour-replay"[^>]*aria-label="How to play"/, 'a ? button replays the tour');
});

// @spec TOUR-003, TOUR-014
test('Next moves through tap steps; "Your turn" accepts a plan that clears the planet on either side', () => {
  let t = tour.start();
  for (let i = 0; i < tour.stepIndex('try'); i++) {
    assert.equal(tour.cardFor(t, paused).canAdvance, true);
    t = tour.next(t);
  }
  assert.equal(tour.current(t).id, 'try');
  assert.match(tour.cardFor(t, paused).text, /BEHIND/);
  assert.match(tour.cardFor(t, paused).text, /FRONT/);
  assert.equal(tour.cardFor(t, paused).canAdvance, false, 'no plan yet');
  const hits = tour.cardFor(t, { ...paused, planDv: -0.2, predictionEnding: 'crashed' });
  assert.equal(hits.canAdvance, false);
  assert.match(hits.text, /still hits the planet/);
  const behind = tour.cardFor(t, { ...paused, planDv: -2, predictionEnding: 'departed' });
  assert.equal(behind.canAdvance, true);
  assert.equal(behind.button, 'Next');
  const front = tour.cardFor(t, { ...paused, planDv: 2, predictionEnding: 'departed' });
  assert.equal(front.canAdvance, true, 'in front counts too');
  assert.equal(tour.sideOf(-1), 'behind');
  assert.equal(tour.sideOf(1), 'front');
  assert.equal(tour.sideOf(0), null);
});

// @spec TOUR-003
test('"Fly!" moves on by itself when play starts, and the result needs the flight to end', () => {
  const fly = tour.current(at('fly'));
  assert.equal(tour.autoAdvances(fly), true);
  assert.equal(tour.conditionMet(fly, paused), false);
  assert.equal(tour.conditionMet(fly, { ...paused, setting: 'normal' }), true);
  const result = tour.current(at('result'));
  assert.equal(tour.conditionMet(result, { ...paused, status: 'flying' }), false);
  assert.equal(tour.conditionMet(result, { ...paused, status: 'departed' }), true);
  const end = tour.next(at('result'));
  assert.equal(end.active, false);
  assert.equal(end.done, true);
});

// @spec TOUR-004
test('cards show while paused; the result card waits for the flight to end', () => {
  const plan = tour.current(at('plan'));
  assert.equal(tour.cardVisible(plan, paused), true);
  assert.equal(tour.cardVisible(plan, { ...paused, setting: 'normal' }), false);
  const result = tour.current(at('result'));
  assert.equal(tour.cardVisible(result, { ...paused, setting: 'normal', status: 'flying' }), false);
  assert.equal(tour.cardVisible(result, { ...paused, setting: 'normal', status: 'departed' }), true);
  assert.equal(tour.cardVisible(result, { ...paused, setting: 'normal', status: 'crashed' }), true);
  assert.equal(tour.cardVisible(null, paused), false);
  const card = tour.cardFor(at('speed'), paused);
  assert.equal(card.n, 3);
  assert.equal(card.of, 8);
  assert.match(html, /id="tour-card"[^>]*hidden/, 'card hidden until the tour shows it');
  assert.match(html, /id="tour-skip"/, 'skippable');
});

// @spec TOUR-001, TOUR-014
test('result cards: Boost behind, Brake in front (it says this side slows you), both lead to I\'m ready', () => {
  const boost = tour.cardFor(at('result'), { ...paused, status: 'departed', change: 7.62 });
  assert.equal(boost.title, 'Boost!');
  assert.match(boost.text, /BEHIND/);
  assert.match(boost.text, /\+7\.6 km\/s/);
  assert.equal(boost.action, 'ready');
  assert.equal(boost.button, "I'm ready");
  assert.equal(boost.secondary, 'Try the other side');
  const brake = tour.cardFor(at('result'), { ...paused, status: 'departed', change: -3.14 });
  assert.equal(brake.title, 'Brake!');
  assert.match(brake.text, /FRONT/);
  assert.match(brake.text, /slows you down/);
  assert.match(brake.text, /3\.1 km\/s/);
  assert.equal(brake.action, 'ready');
  assert.equal(brake.secondary, 'Try the other side');
  const flat = tour.cardFor(at('result'), { ...paused, status: 'departed', change: 0.01 });
  assert.equal(flat.button, 'Try again');
  assert.equal(flat.action, 'retry');
});

// @spec TOUR-014
test('the mid-swing checkpoint explains the side that was flown', () => {
  const swing = at('swing', { swingShown: true });
  assert.match(tour.cardFor({ ...swing, side: 'behind' }, { ...paused, status: 'flying' }).text, /behind it, its pull drags you along/);
  const front = tour.cardFor({ ...swing, side: 'front' }, { ...paused, status: 'flying' }).text;
  assert.match(front, /FRONT/);
  assert.match(front, /slows you down/);
  assert.match(tour.cardFor(at('try', { otherSide: true }), paused).text, /Now try the other side/);
});

// @spec TOUR-005
test('a crash on the tour flight explains why and sends the player back to "Your turn"', () => {
  const crash = tour.cardFor(at('result'), { ...paused, status: 'crashed' });
  assert.match(crash.title, /Bonk/);
  assert.equal(crash.action, 'retry');
  const back = tour.afterCrash();
  assert.equal(tour.current(back).id, 'try');
  assert.match(tour.cardFor(back, paused).text, /Too close/);
});

// @spec TOUR-006
test('during the tour only the input each step teaches is live', () => {
  const step = (id) => tour.current(at(id));
  for (const id of ['ship', 'planet', 'speed']) {
    assert.equal(tour.inputAllowed(step(id), 'push'), false, `${id}: no steering yet`);
    assert.equal(tour.inputAllowed(step(id), 'time'), false, `${id}: no flying yet`);
  }
  // "Fuel, and planning is free" says "drag to plan": the drag must move the line (ZZF-91).
  assert.equal(tour.inputAllowed(step('plan'), 'push'), true, 'plan: steering is live');
  assert.equal(tour.inputAllowed(step('plan'), 'time'), false, 'plan: no flying yet');
  assert.equal(tour.inputAllowed(step('try'), 'push'), true);
  assert.equal(tour.inputAllowed(step('try'), 'time'), false);
  assert.equal(tour.inputAllowed(step('fly'), 'time'), true);
  assert.equal(tour.inputAllowed(null, 'push'), true, 'no tour: everything allowed');
});

// @spec TOUR-006
test('R restarts normally, but on the tour only acts once a result card is up', () => {
  const step = (id) => tour.current(at(id));
  assert.equal(tour.resetAction(null, paused), 'restart');
  assert.equal(tour.resetAction(step('plan'), paused), null, 'teaching steps ignore R');
  assert.equal(tour.resetAction(step('result'), { ...paused, setting: 'normal', status: 'flying' }), null, 'mid-flight: nothing');
  assert.equal(tour.resetAction(step('result'), { ...paused, status: 'crashed' }), 'retry');
  assert.equal(tour.resetAction(step('result'), { ...paused, status: 'departed', change: 5 }), 'ready');
  assert.equal(tour.resetAction(step('result'), { ...paused, status: 'departed', change: -1 }), 'ready', 'a brake also completes it');
  assert.equal(tour.resetAction(step('result'), { ...paused, status: 'departed', change: 0 }), 'retry');
});

// @spec TOUR-004
test('pausing mid-way through the tour flight shows how to carry on', () => {
  const result = tour.current(at('result'));
  const ctx = { ...paused, setting: 'paused', status: 'flying' };
  assert.equal(tour.cardVisible(result, ctx), true);
  const card = tour.cardFor(at('result'), ctx);
  assert.equal(card.title, 'Paused');
  assert.match(card.text, /Normal or Space/);
  assert.equal(card.button, null);
});

// @spec TOUR-003
test('the tour\'s "Your turn" is achievable in the real physics on both sides, with boost and brake results', () => {
  for (const [dir, sign] of [['down', 1], ['up', -1]]) {
    let s = sim.planningBurn(sim.initialState(), dir, 3);
    const pred = sim.predict(s);
    assert.equal(pred.ending, 'departed', `${dir}: plan clears the planet`);
    assert.equal(tour.cardFor(at('try'), { ...paused, planDv: s.planDv, predictionEnding: pred.ending }).canAdvance, true);
    for (let i = 0; i < 80000 && s.status === 'flying'; i++) s = sim.step(s, null);
    assert.equal(s.status, 'departed');
    assert.ok(sign * sim.speedChange(s) > 0.05, `${dir}: ${sign > 0 ? 'boost' : 'brake'} (${sim.speedChange(s)})`);
  }
});

// @spec TOUR-011
test('mid-swing checkpoint: fires once, just after closest approach on a close pass', () => {
  const t = at('swing');
  assert.equal(tour.swingCheckpointDue(t, { distance: 5e5, closest: 5e5 }), false, 'still closing in');
  assert.equal(tour.swingCheckpointDue(t, { distance: 5.1e5, closest: 5e5 }), true, 'just passed closest');
  assert.equal(tour.swingCheckpointDue({ ...t, swingShown: true }, { distance: 6e5, closest: 5e5 }), false, 'only once');
  assert.equal(tour.swingCheckpointDue(at('fly'), { distance: 6e5, closest: 5e5 }), false, 'only on the swing step');
  assert.equal(tour.swingCheckpointDue(t, { distance: 3.9e6, closest: 3.8e6 }), false, 'not on a wide miss');
  const shown = tour.cardFor({ ...t, swingShown: true }, { ...paused, status: 'flying' });
  assert.equal(shown.title, 'How the slingshot works');
  assert.match(shown.text, /gravity/i);
  assert.match(shown.text, /behind/);
  assert.equal(shown.button, 'Keep flying');
  assert.equal(shown.action, 'resume');
  assert.equal(tour.cardFor(t, { ...paused, status: 'flying' }).title, 'Paused', 'paused before the checkpoint');
  assert.equal(tour.inputAllowed(tour.current(t), 'time'), true, 'Keep flying can resume play');
});

// @spec TOUR-011
test('in the real physics, the checkpoint fires mid-swing close to the planet', () => {
  let s = sim.planningBurn(sim.initialState(), 'down', 3);
  const t = at('swing');
  let fired = null;
  for (let i = 0; i < 60000 && s.status === 'flying'; i++) {
    s = sim.step(s, null);
    const r = sim.planetRelativePosition(s);
    const d = Math.hypot(r.x, r.y);
    if (tour.swingCheckpointDue(t, { distance: d, closest: s.closest })) { fired = d; break; }
  }
  assert.ok(fired, 'checkpoint fired');
  assert.ok(fired < 1.01 * s.closest + 1e3, `fired right after closest approach (${fired} vs ${s.closest})`);
  assert.ok(s.closest < 20 * sim.PLANET_RADIUS, 'a genuinely close swing');
});

// @spec TOUR-012
test('Back goes one step back on every step up to "Fly!", never during or after the flight', () => {
  assert.equal(tour.canGoBack(tour.start()), false, 'nothing before step 1');
  const back = tour.prev(at('plan'));
  assert.equal(tour.current(back).id, 'speed');
  assert.equal(tour.current(tour.prev(at('fly'))).id, 'try');
  assert.equal(tour.canGoBack(at('swing')), false);
  assert.equal(tour.canGoBack(at('result')), false);
  assert.deepEqual(tour.prev(at('result')), at('result'), 'no-op when not allowed');
  assert.match(html, /id="tour-back"[^>]*hidden/, 'Back button on the card, hidden until usable');
});

// @spec TOUR-013
test('the level follows the tutorial: no "coming soon" free-flight note on the page', () => {
  assert.doesNotMatch(html, /free-note|coming soon/);
});

// @spec TOUR-014
test('the side chosen at launch survives the move from "Fly!" to the checkpoint', () => {
  const launched = { ...at('fly'), side: 'front' };
  const swing = { ...tour.next(launched), swingShown: true };
  assert.equal(tour.current(swing).id, 'swing');
  assert.equal(swing.side, 'front');
  assert.match(tour.cardFor(swing, { ...paused, status: 'flying' }).text, /slows you down/);
  assert.equal(tour.next(swing).side, 'front', 'kept into the result step too');
  assert.match(tour.STEPS.find((s) => s.id === 'speed').text, /up, or pull it down/);
});

// @spec TOUR-015
test('the start screen offers Tutorial or Sample mission; only Enter (Tutorial) acts on it', () => {
  assert.equal(tour.DOOR.title, 'Slingshot');
  assert.match(tour.DOOR.text, /fuel/);
  assert.deepEqual(tour.DOOR.choices.map((c) => [c.id, c.label]), [['tutorial', 'Tutorial'], ['mission', 'Sample mission']]);
  assert.equal(tour.doorKey('Enter'), 'tutorial');
  for (const k of [' ', 'r', 'R', 'ArrowUp', 'ArrowDown', '3']) assert.equal(tour.doorKey(k), null, `${k} does nothing`);
  assert.match(html, /id="door"[^>]*>/, 'start screen in the page');
  assert.match(html, /id="door-tutorial"/);
  assert.match(html, /id="door-mission"/);
});

// @spec TOUR-016
test('the card docks in the strip above the time buttons, centred, at most 640 px wide', () => {
  assert.deepEqual(tour.cardStrip(1316, 725), { left: 338, width: 640, bottom: 709 });
  assert.deepEqual(tour.cardStrip(950, 613), { left: 155, width: 640, bottom: 597 });
  assert.deepEqual(tour.cardStrip(390, 780), { left: 16, width: 358, bottom: 712 }, 'phones: clear of the feedback button');
  assert.equal(tour.STEPS.some((s) => 'anchor' in s), false, 'no step positions its card');
});
