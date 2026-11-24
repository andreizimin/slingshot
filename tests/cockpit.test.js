import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as view from '../site/cockpit/view.js';
import { track, PREFIX } from '../site/cockpit/analytics.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
const html = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');

// @spec COCKPIT-CAM-002
test('target scale frames the ship at 35% of the smaller side, clamped', () => {
  const W = 1600, H = 1000;
  close(view.targetScale({ x: -1.75e6, y: 0 }, W, H), 1.75e6 / 350, 1e-9);
  assert.equal(view.targetScale({ x: -1e3, y: 0 }, W, H), view.SCALE_MIN);
  assert.equal(view.targetScale({ x: -1e9, y: 0 }, W, H) >= view.SCALE_MAX, true);
});

// @spec COCKPIT-CAM-005
test('target scale keeps the ship clear of the HUD bands and side margins', () => {
  const W = 390, H = 844; // phone
  const rel = { x: 0, y: 3e6 };
  const s = view.targetScale(rel, W, H);
  assert.ok(rel.y / s <= H / 2 - 170 + 1e-9, 'stays below the top HUD');
  const relX = { x: -4e6, y: 0 };
  const sx = view.targetScale(relX, W, H);
  assert.ok(Math.abs(relX.x) / sx <= W / 2 - 60 + 1e-9, 'stays inside the narrow-screen side margin');
});

// @spec COCKPIT-DRAW-002
test('planet is drawn at true size, but never under 24 px', () => {
  assert.equal(view.planetDrawRadius(71492, 20000), 24);
  close(view.planetDrawRadius(71492, 1000), 71.492, 1e-9);
});

// @spec COCKPIT-DRAW-010
test('radial remap puts the true surface on the drawn edge and barely moves far points', () => {
  const trueR = 5, drawR = 30;
  const [sx, sy] = view.radialRemap(trueR, 0, trueR, drawR);
  close(Math.hypot(sx, sy), drawR, 1e-9, 'surface lands on drawn radius');
  const [fx] = view.radialRemap(2000, 0, trueR, drawR);
  close(fx, 2000, 0.25, 'far point nearly unchanged');
  const [ax, ay] = view.radialRemap(30, 40, trueR, drawR);
  close(Math.atan2(ay, ax), Math.atan2(40, 30), 1e-12, 'bearing preserved');
  assert.deepEqual(view.radialRemap(10, 0, 30, 30), [10, 0], 'no change when not inflated');
  // Monotonic: farther points stay farther, so paths never fold.
  let prev = 0;
  for (let d = 1; d < 500; d += 7) {
    const r = Math.hypot(...view.radialRemap(d, 0, trueR, drawR));
    assert.ok(r > prev);
    prev = r;
  }
});

// @spec COCKPIT-CTL-009
test('drag direction uses only the vertical part beyond the dead zone', () => {
  assert.equal(view.dragDirection(0, -30), 'up');
  assert.equal(view.dragDirection(0, 30), 'down');
  assert.equal(view.dragDirection(200, 10), null, 'horizontal drags do nothing');
  assert.equal(view.dragDirection(0, 24), null, 'inside dead zone');
});

// @spec COCKPIT-HUD-003, COCKPIT-HUD-007
test('fuel bar shows fuel after the plan as solid and current fuel as striped', () => {
  assert.deepEqual(view.fuelBar(10, 0, 10), { solid: 1, striped: 1, low: false });
  const b = view.fuelBar(10, -3, 10);
  close(b.solid, 0.7, 1e-12);
  assert.equal(b.striped, 1);
  assert.equal(view.fuelBar(1.5, 0, 10).low, true);
});

// @spec COCKPIT-HUD-002
test('speed change readout: arrow, sign and tone', () => {
  assert.deepEqual(view.changeReadout(3.21), { tone: 'up', text: '▲ +3.2' });
  assert.deepEqual(view.changeReadout(-1.05), { tone: 'down', text: '▼ −1.1' });
  assert.equal(view.changeReadout(0.01).tone, 'flat');
});

// @spec COCKPIT-MSG-001, COCKPIT-MSG-002, COCKPIT-MSG-003, COCKPIT-MOB-002
test('messages for ready, crash and result, with touch wording', () => {
  const base = { status: 'flying', ready: false, coarse: false, change: 0, fuelFraction: 1 };
  assert.equal(view.messageFor(base), null);
  assert.match(view.messageFor({ ...base, ready: true }).html, /press Space/);
  assert.match(view.messageFor({ ...base, ready: true, coarse: true }).html, /tap Normal/);
  assert.match(view.messageFor({ ...base, status: 'crashed' }).html, /Bonk!/);
  const boost = view.messageFor({ ...base, status: 'departed', change: 6.6, fuelFraction: 0.78 }).html;
  assert.match(boost, /Boost! \+6\.6 km\/s/);
  assert.match(boost, /Fuel left: 78%/);
  assert.match(view.messageFor({ ...base, status: 'departed', change: -4 }).html, /Brake! −4\.0/);
});

// @spec COCKPIT-DRAW-005
test('Star badge sits on the left edge, in line with the planet, at the start', () => {
  const W = 1600, H = 1000, r = 22;
  const { cx, cy } = view.sunBadgePosition(Math.PI, W, H, r, false);
  close(cx, r * 1.9, 1e-9);
  close(cy, H / 2, 1e-9);
  const up = view.sunBadgePosition(-Math.PI / 2, W, H, r, false);
  close(up.cy, 190, 1e-9, 'kept below the top HUD band');
});

// @spec COCKPIT-PRED-002
test('prediction line shows only while paused', () => {
  assert.equal(view.showPrediction('paused'), true);
  for (const s of ['slow', 'normal', 'fast']) assert.equal(view.showPrediction(s), false);
});

// @spec COCKPIT-TUNE-001
test('speed tuner is hidden unless ?tune is in the URL', () => {
  assert.equal(view.tunerEnabled(''), false);
  assert.equal(view.tunerEnabled('?tune'), true);
  assert.equal(view.tunerEnabled('?a=1&tune=1'), true);
  assert.match(html, /id="tuner-toggle"[^>]*\bhidden\b/, 'button hidden in the page by default');
});

// @spec ANA-001
test('page loads the shared Umami tracker, deferred', () => {
  assert.match(html, /<script defer src="https:\/\/cloud\.umami\.is\/script\.js" data-website-id="[0-9a-f-]{36}"><\/script>/);
});

// @spec ANA-004
test('track prefixes events and is a no-op without a tracker', () => {
  const calls = [];
  const w = { umami: { track: (n, d) => calls.push([n, d]) } };
  track('launch', { planned_dv: 1 }, w);
  assert.deepEqual(calls, [[`${PREFIX}launch`, { planned_dv: 1 }]]);
  assert.doesNotThrow(() => track('launch', {}, {}));
  assert.doesNotThrow(() => track('launch', {}, undefined));
  assert.doesNotThrow(() => track('launch', {}, { umami: { track() { throw new Error('blocked'); } } }));
});

// @spec ANA-003
test('flight end events: one result or crash, counts only', () => {
  const ctx = { change: 6.64, fuelFraction: 0.781 };
  assert.deepEqual(view.flightEvents('flying', 'departed', ctx), [
    { name: 'flyby_result', data: { outcome: 'boost', change: 6.6, fuel_left: 78 } },
  ]);
  assert.deepEqual(view.flightEvents('flying', 'crashed', ctx), [{ name: 'crash', data: { fuel_left: 78 } }]);
  assert.deepEqual(view.flightEvents('flying', 'flying', ctx), []);
  assert.deepEqual(view.flightEvents('departed', 'departed', ctx), [], 'sent once, not every frame');
  assert.equal(view.flightEvents('flying', 'departed', { change: -3, fuelFraction: 1 })[0].data.outcome, 'brake');
});

// @spec ANA-002
test('launch event carries only the planned sideways change, rounded', () => {
  assert.deepEqual(view.launchEvent(-1.26), { name: 'launch', data: { planned_dv: 1.3 } });
  assert.deepEqual(view.launchEvent(0), { name: 'launch', data: { planned_dv: 0 } });
});

// @spec ANA-005
test('analytics payloads hold only numbers and fixed categories', () => {
  const ctx = { change: -2.345, fuelFraction: 0.5 };
  const payloads = [
    view.launchEvent(2).data,
    ...view.flightEvents('flying', 'departed', ctx).map((e) => e.data),
    ...view.flightEvents('flying', 'crashed', ctx).map((e) => e.data),
  ];
  for (const p of payloads) {
    for (const [k, v] of Object.entries(p)) {
      if (k === 'outcome') assert.ok(['boost', 'brake', 'none'].includes(v));
      else assert.equal(typeof v, 'number', `${k} must be a number`);
    }
  }
});

// @spec FEED-001
test('page loads the shared feedback widget for project "slingshot", above the time buttons', () => {
  assert.match(html, /<script src="https:\/\/feedback\.andreizimin\.com\/widget\.js" data-project="slingshot"[^>]*data-offset="[^"]+"[^>]*defer><\/script>/);
});

// @spec COCKPIT-HUD-008
test('approach readout: far speed against the catch speed, green only when strictly under', () => {
  assert.equal(view.approachReadout({ inside: false, farSpeed: 3, catchSpeed: 5 }), null);
  assert.deepEqual(view.approachReadout({ inside: true, farSpeed: 7.24, catchSpeed: 5 }), { text: 'Approach 7.2 km/s · need under 5', ok: false });
  assert.deepEqual(view.approachReadout({ inside: true, farSpeed: 4.96, catchSpeed: 5 }), { text: 'Approach 5.0 km/s · need under 5', ok: true });
  assert.equal(view.approachReadout({ inside: true, farSpeed: 5, catchSpeed: 5 }).ok, false, 'exactly 5 is not under');
});

// @spec COCKPIT-DRAW-012
test('destination marker: ring at true scale but at least 30 px; label with name and million-km distance', () => {
  assert.equal(view.catchRingRadius(3.0e6, 20000), 150);
  assert.equal(view.catchRingRadius(3.0e6, 200000), 30, 'never under 30 px');
  assert.equal(view.destinationLabel('Haven', 12_349_000), 'Haven · 12.3M km');
  assert.equal(view.destinationLabel('Haven', 950_000), 'Haven · 1.0M km');
});
