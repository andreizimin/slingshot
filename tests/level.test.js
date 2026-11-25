import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../site/sim/physics.js';
import { LEVEL_1 } from '../site/sim/levels.js';
import * as level from '../site/cockpit/level.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

// Fly a level from its start: plans is a list of { t, aim, dv } (aim in radians, absolute; dv a
// forward burn) queued when sim time reaches t.
function fly(plans, maxSteps = 100000) {
  let s = sim.initialState(LEVEL_1);
  const queue = [...plans].sort((a, b) => a.t - b.t);
  for (let i = 0; i < maxSteps && s.status === 'flying'; i++) {
    while (queue.length && s.t >= queue[0].t) {
      const p = queue.shift();
      s = sim.planningBurn(sim.planAim(s, p.aim - s.aim), p.dv);
    }
    s = sim.step(s, null);
  }
  return s;
}

// @spec LEVEL-001
test('the pond: three drifting Jupiter-like worlds, Haven the destination, no star', () => {
  assert.equal(LEVEL_1.starGM ?? null, null);
  assert.deepEqual(LEVEL_1.worlds.map((w) => w.name), ['Home', 'Racer', 'Haven']);
  for (const w of LEVEL_1.worlds) {
    assert.equal(w.gm, 1.26687e8);
    assert.equal(w.radius, 71492);
  }
  assert.deepEqual(LEVEL_1.worlds.map((w) => w.drift), [
    { x: 0, y: 0, vx: 0, vy: 13 },
    { x: -9.776e6, y: 14.385e6, vx: 14, vy: 0 },
    { x: 3.344e6, y: 9.463e6, vx: -7.023, vy: 14.733 },
  ]);
  assert.deepEqual(LEVEL_1.end, { rule: 'level', destination: 2, catchRadius: 3.0e6, catchSpeed: 5, lostDistance: 3.0e7 });
  assert.equal(LEVEL_1.fuel, 10);
  assert.equal(LEVEL_1.predictSteps, 40000);
});

// @spec LEVEL-002
test('the ship starts as in the tutorial, relative to Home', () => {
  const s = sim.initialState(LEVEL_1);
  assert.deepEqual(s.pos, { x: -4.0e6, y: 0 });
  close(s.vel.x, Math.sqrt(100 + (2 * 1.26687e8) / 4.0e6), 1e-12);
  assert.equal(s.vel.y, 13);
  assert.equal(s.focus, 0);
  // Relative to Home it is exactly the tutorial's start.
  const t = sim.initialState();
  assert.deepEqual(sim.planetRelativePosition(s), sim.planetRelativePosition(t));
  close(sim.planetFrameVelocity(s).x, sim.planetFrameVelocity(t).x, 1e-9);
});

// @spec LEVEL-003
test('stars by fuel left: 6 km/s or more is three, 3 or more is two, any arrival one; a loss is none', () => {
  assert.equal(level.starsFor('arrived', 7), 3);
  assert.equal(level.starsFor('arrived', 6), 3);
  assert.equal(level.starsFor('arrived', 6 - 5e-10), 3, 'float noise does not cost a star');
  assert.equal(level.starsFor('arrived', 5.99), 2);
  assert.equal(level.starsFor('arrived', 3), 2);
  assert.equal(level.starsFor('arrived', 2.99), 1);
  assert.equal(level.starsFor('arrived', 0), 1);
  assert.equal(level.starsFor('crashed', 9), 0);
  assert.equal(level.starsFor('lost', 9), 0);
});

// @spec LEVEL-004
test('the designed route: aim straight down, burn 3 km/s, then coast, is caught by Haven with three stars', () => {
  const s = fly([{ t: 0, aim: -Math.PI / 2, dv: 3 }]);
  assert.equal(s.status, 'arrived', `ended ${s.status}`);
  assert.ok(s.fuel >= 6 - 1e-9, `fuel left ${s.fuel}`);
  assert.equal(level.starsFor(s.status, s.fuel), 3);
});

// @spec LEVEL-005
test('fuel alone cannot do it: Haven moves too differently from the ship', () => {
  const s = sim.initialState(LEVEL_1);
  const haven = LEVEL_1.worlds[2].drift;
  const gap = Math.hypot(haven.vx - s.vel.x, haven.vy - s.vel.y);
  assert.ok(gap > LEVEL_1.fuel + LEVEL_1.end.catchSpeed, `gap ${gap}`);
});

// @spec LEVEL-006
test('the level is forgiving: other first burns still win with one later correction', () => {
  const winners = [];
  for (const push of [2, 4]) {
    let won = null;
    for (const t of [1e5, 1.5e5, 2.5e5]) {
      for (let k = 0; k < 8 && !won; k++) {
        const aim = (k * Math.PI) / 4;
        for (const dv of [0.5, 1, 1.5, 2, 3]) {
          const s = fly([{ t: 0, aim: -Math.PI / 2, dv: push }, { t, aim, dv }]);
          if (s.status === 'arrived') { won = { push, t, aim, dv, fuel: s.fuel }; break; }
        }
      }
      if (won) break;
    }
    if (won) winners.push(won);
  }
  assert.ok(winners.length >= 2, `winning first burns: ${JSON.stringify(winners)}`);
});

// @spec LEVEL-008
test('result cards: stars and fuel when arrived, the world hit when crashed, lost in space when lost', () => {
  const arrived = level.resultCard({ status: 'arrived', fuel: 6.04, crashedInto: null }, LEVEL_1);
  assert.match(arrived.html, /★★★/);
  assert.match(arrived.html, /Fuel left: 60%/);
  assert.equal(arrived.button, 'Fly again');
  const two = level.resultCard({ status: 'arrived', fuel: 4.0 }, LEVEL_1);
  assert.match(two.html, /★★☆/);
  const crashed = level.resultCard({ status: 'crashed', fuel: 5, crashedInto: 1 }, LEVEL_1);
  assert.match(crashed.html, /Bonk!.*You hit Racer/);
  assert.equal(crashed.button, 'Try again');
  const lost = level.resultCard({ status: 'lost', fuel: 5 }, LEVEL_1);
  assert.match(lost.html, /Lost in space/);
  assert.equal(lost.button, 'Try again');
  assert.equal(level.resultCard({ status: 'flying', fuel: 5 }, LEVEL_1), null);
});

// @spec LEVEL-012
test('level events: start once on the first launch, end once with outcome, rounded fuel and stars', () => {
  assert.deepEqual(level.launchEvent(), { name: 'level_start', data: {} });
  const end = level.endEvents('flying', { status: 'arrived', fuel: 5.996 }, LEVEL_1);
  assert.deepEqual(end, [{ name: 'level_end', data: { outcome: 'arrived', fuel_left: 60, stars: 2 } }]);
  assert.deepEqual(level.endEvents('flying', { status: 'crashed', fuel: 4 }, LEVEL_1)[0].data, { outcome: 'crashed', fuel_left: 40, stars: 0 });
  assert.deepEqual(level.endEvents('flying', { status: 'lost', fuel: 4 }, LEVEL_1)[0].data.outcome, 'lost');
  assert.deepEqual(level.endEvents('arrived', { status: 'arrived', fuel: 6 }, LEVEL_1), [], 'sent once, not every frame');
  assert.deepEqual(level.endEvents('flying', { status: 'flying', fuel: 6 }, LEVEL_1), []);
});
