import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sim from '../site/sim/physics.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
const rel = (s) => sim.planetRelativePosition(s);
const dist = (s) => Math.hypot(rel(s).x, rel(s).y);

function coast(s, max = 200000) {
  for (let i = 0; i < max && s.status === 'flying'; i++) s = sim.step(s, null);
  return s;
}

// @spec SIM-SCN-002
test('planet follows prescribed circle with exact derivative velocity', () => {
  const t = 1e6;
  const p = sim.planetPosition(t);
  close(Math.hypot(p.x, p.y), sim.ORBIT_RADIUS, 1e-3);
  const h = 1;
  const a = sim.planetPosition(t - h);
  const b = sim.planetPosition(t + h);
  const v = sim.planetVelocity(t);
  close((b.x - a.x) / (2 * h), v.x, 1e-6);
  close((b.y - a.y) / (2 * h), v.y, 1e-6);
  close(Math.hypot(v.x, v.y), Math.sqrt(sim.STAR_GM / sim.ORBIT_RADIUS), 1e-9);
});

// @spec SIM-SCN-003, SIM-SCN-004
test('initial state: 4e6 km sunward, v_inf 10 km/s, full fuel', () => {
  const s = sim.initialState();
  const r = rel(s);
  close(r.x, -4.0e6, 1e-6);
  close(r.y, 0, 1e-6);
  const v = sim.planetFrameVelocity(s);
  close(v.x, Math.sqrt(100 + (2 * sim.PLANET_GM) / 4.0e6), 1e-9);
  close(v.y, 0, 1e-9);
  assert.equal(s.t, 0);
  assert.equal(s.steps, 0);
  assert.equal(s.fuel, 10.0);
  assert.equal(s.status, 'flying');
  close(s.closest, 4.0e6, 1e-6);
  close(s.startSpeed, sim.starFrameSpeed(s), 1e-12);
  const g = sim.gravity(s.pos.x, s.pos.y, 0);
  assert.deepEqual(s.grav, g);
});

// @spec SIM-STEP-001
test('step advances one DT and stores gravity only', () => {
  const s0 = sim.initialState();
  const s1 = sim.step(s0, 'up');
  assert.equal(s1.t, 30);
  assert.equal(s1.steps, 1);
  assert.deepEqual(s1.grav, sim.gravity(s1.pos.x, s1.pos.y, 30));
});

// @spec SIM-STEP-003
test('step does not mutate its input', () => {
  const s0 = sim.initialState();
  const copy = structuredClone(s0);
  sim.step(s0, 'down');
  assert.deepEqual(s0, copy);
});

// @spec SIM-STEP-004
test('crashed and departed states are frozen', () => {
  for (const status of ['crashed', 'departed']) {
    const s = { ...sim.initialState(), status };
    assert.deepEqual(sim.step(s, 'up'), s);
  }
});

// @spec SIM-STEP-005
test('closest tracks minimum distance', () => {
  let s = sim.initialState();
  for (let i = 0; i < 100; i++) s = sim.step(s, null);
  close(s.closest, dist(s), 1e-6);
  assert.ok(s.closest < 4.0e6);
});

// A state already facing `angle` with the engine at full throttle.
const spooled = (angle, extra = {}) => ({ ...sim.initialState(), heading: angle, throttle: 1, ...extra });

// @spec SIM-FUEL-001
test('full-throttle thrust spends THRUST_ACCEL*DT fuel and pushes along the nose', () => {
  const up0 = spooled(Math.PI / 2);
  const up = sim.step(up0, 'up');
  close(up.fuel, 10.0 - 5e-5 * 30, 1e-12);
  close(up.vel.y - sim.step(up0, null).vel.y, 5e-5 * 30, 1e-9);
  const left0 = spooled(Math.PI);
  assert.deepEqual(sim.step(left0, 'left').vel, sim.step(left0, null).vel, 'no thrust toward/away from the planet');
});

// @spec SIM-FUEL-002
test('last partial burn empties fuel exactly', () => {
  const s0 = spooled(-Math.PI / 2, { fuel: 0.0005 });
  const s1 = sim.step(s0, 'down');
  assert.equal(s1.fuel, 0);
  close(s1.vel.y - sim.step(s0, null).vel.y, -0.0005, 1e-9);
});

// @spec SIM-FUEL-003
test('no thrust when fuel is empty', () => {
  const s0 = spooled(Math.PI / 2, { fuel: 0 });
  const a = sim.step(s0, 'up');
  const b = sim.step(s0, null);
  assert.deepEqual(a.vel, b.vel);
  assert.equal(a.fuel, 0);
  assert.equal(a.throttle, 0);
});

// @spec SIM-FUEL-006
test('ship turns at a limited rate and spools up before full thrust', () => {
  let s = sim.initialState(); // facing +x
  s = sim.step(s, 'up');
  assert.equal(s.fuel, 10.0, 'no thrust while still turning');
  close(s.heading, sim.TURN_RATE, 1e-12);
  let steps = 1;
  while (s.fuel === 10.0 && steps < 1000) { s = sim.step(s, 'up'); steps++; }
  const minTurn = Math.ceil((Math.PI / 2 - sim.ALIGN_TOLERANCE) / sim.TURN_RATE);
  assert.ok(steps >= minTurn, `fired after ${steps} steps, expected at least ${minTurn}`);
  close(s.throttle, 1 / sim.SPOOL_STEPS, 1e-12);
  for (let i = 0; i < sim.SPOOL_STEPS + 5; i++) s = sim.step(s, 'up');
  assert.equal(s.throttle, 1);
  s = sim.step(s, null);
  assert.equal(s.throttle, 0, 'engine cuts when the push stops');
});

// @spec SIM-FUEL-007
test('a queued manoeuvre is flown later and delivers exactly the planned delta-v', () => {
  const start = sim.initialState();
  let s = sim.planningBurn(start, 'down', 1.0);
  assert.equal(s.fuel, 10.0, 'planning spends nothing');
  for (let i = 0; i < 20000 && s.planDv !== 0; i++) s = sim.step(s, null);
  assert.equal(s.planDv, 0);
  close(s.fuel, 9.0, 1e-9);
  assert.equal(s.throttle, 0);
});

// @spec SIM-FUEL-004
test('unknown thrust direction is ignored', () => {
  const s0 = sim.initialState();
  assert.deepEqual(sim.step(s0, 'sideways'), sim.step(s0, null));
  assert.deepEqual(sim.step(s0, 'toString'), sim.step(s0, null));
});

// @spec SIM-FUEL-005
test('planning burn queues a manoeuvre without moving, spending, or advancing time', () => {
  const s0 = sim.initialState();
  const s1 = sim.planningBurn(s0, 'down', 0.4);
  close(s1.planDv, -0.4, 1e-12);
  assert.deepEqual(s1.vel, s0.vel);
  assert.equal(s1.fuel, 10.0);
  assert.deepEqual(s1.pos, s0.pos);
  assert.equal(s1.t, 0);
  assert.equal(s0.planDv, 0, 'input untouched');
  const back = sim.planningBurn(s1, 'up', 0.4);
  assert.equal(back.planDv, 0, 'reversible: up cancels down');
  assert.deepEqual(sim.planningBurn(s1, 'right', 0.3), s1, 'only sideways plans');
  const capped = sim.planningBurn({ ...s0, fuel: 0.1 }, 'up', 1);
  close(capped.planDv, 0.1, 1e-12);
  assert.deepEqual(sim.planningBurn(s0, 'sideways', 1), s0);
  const crashed = { ...s0, status: 'crashed' };
  assert.deepEqual(sim.planningBurn(crashed, 'up', 1), crashed);
});

// @spec SIM-READ-002
test('speed splits into toward-planet and sideways components', () => {
  const s = sim.initialState();
  const c = sim.speedComponents(s);
  close(c.toward, Math.sqrt(100 + (2 * sim.PLANET_GM) / 4.0e6), 1e-9);
  close(c.side, 0, 1e-9);
  const { side } = sim.axes(s);
  close(side.x, 0, 1e-12);
  close(side.y, 1, 1e-12);
});

// @spec SIM-END-001, SIM-END-003
test('coasting from the default start crashes', () => {
  const s = coast(sim.initialState());
  assert.equal(s.status, 'crashed');
  assert.ok(dist(s) < sim.PLANET_RADIUS);
});

// @spec SIM-TIME-002, SIM-TIME-003
test('stepsForFrame converts real time with carry and clamps', () => {
  assert.deepEqual(sim.RATES, { paused: 0, slow: 200, normal: 800, fast: 3300 });
  let r = sim.stepsForFrame('normal', 1 / 60, 0);
  assert.equal(r.steps, Math.floor(800 / 60));
  close(r.carry, 800 / 60 - Math.floor(800 / 60), 1e-9);
  r = sim.stepsForFrame('fast', 10, 0);
  assert.equal(r.steps, Math.floor(3300 * 0.25), 'clamped to 0.25 s');
  r = sim.stepsForFrame('paused', 0.1, 0.5);
  assert.equal(r.steps, 0);
  close(r.carry, 0.5, 1e-12);
  r = sim.stepsForFrame('slow', 0.01, 0.9);
  assert.equal(r.steps, 2);
  close(r.carry, 0.9, 1e-9);
});

// @spec SIM-TIME-004
test('advance returns samples every 10th step', () => {
  const { state, samples } = sim.advance(sim.initialState(), 35, null);
  assert.equal(state.steps, 35);
  assert.equal(samples.length, 3);
});

// @spec SIM-TIME-005
test('grouping steps into frames does not change the trajectory', () => {
  let a = sim.initialState();
  for (let i = 0; i < 10; i++) a = sim.advance(a, 64, i < 3 ? 'down' : null).state;
  let b = sim.initialState();
  for (let i = 0; i < 640; i++) b = sim.advance(b, 1, i < 192 ? 'down' : null).state;
  assert.deepEqual(a, b);
});

// @spec SIM-PRED-001, SIM-PRED-002, SIM-PRED-004
test('prediction matches the live coasting trajectory and leaves state alone', () => {
  const s0 = sim.advance(sim.initialState(), 50, 'down').state;
  const copy = structuredClone(s0);
  const pred = sim.predict(s0, 2000);
  assert.deepEqual(s0, copy);
  let live = s0;
  for (let k = 1; k <= 5; k++) {
    for (let i = 0; i < 20; i++) live = sim.step(live, null);
    assert.deepEqual(pred.points[k - 1].ship, live.pos);
    assert.deepEqual(pred.points[k - 1].planet, sim.planetPosition(live.t));
  }
});

// @spec SIM-PRED-003
test('prediction stops at crash and reports the ending', () => {
  const pred = sim.predict(sim.initialState());
  assert.equal(pred.ending, 'crashed');
  const short = sim.predict(sim.initialState(), 100);
  assert.equal(short.ending, 'horizon');
  assert.equal(short.points.length, 5);
});

// @spec SIM-READ-001
test('readouts', () => {
  const s = sim.initialState();
  close(sim.speedChange(s), 0, 1e-12);
  const pv = sim.planetVelocity(0);
  const fv = sim.planetFrameVelocity(s);
  close(fv.x + pv.x, s.vel.x, 1e-12);
});

// @spec SIM-ACC-001
test('flyby conserves planet-frame speed within 0.1%', () => {
  const p = sim.planetPosition(0);
  const pv = sim.planetVelocity(0);
  const d = 4.0e6;
  const b = 6.5e5;
  const v = Math.sqrt(100 + (2 * sim.PLANET_GM) / Math.hypot(d, b));
  const pos = { x: p.x - d, y: p.y - b };
  let s = {
    ...sim.initialState(),
    pos,
    vel: { x: pv.x + v, y: pv.y },
    grav: sim.gravity(pos.x, pos.y, 0),
    fuel: 0,
  };
  const R = 2.5e6;
  let vin = null;
  let vout = null;
  let inside = false;
  for (let i = 0; i < 100000 && s.status === 'flying'; i++) {
    s = sim.step(s, null);
    const r = dist(s);
    const fv = sim.planetFrameVelocity(s);
    if (!inside && r < R) { inside = true; vin = Math.hypot(fv.x, fv.y); }
    if (inside && r > R) { vout = Math.hypot(fv.x, fv.y); break; }
  }
  assert.ok(vin && vout, 'flyby completed');
  assert.ok(s.closest > sim.PLANET_RADIUS);
  assert.ok(Math.abs(vout - vin) / vin < 0.001, `in ${vin} out ${vout}`);
});

function burnHalfThenCoast(dir) {
  let s = sim.initialState();
  while (s.fuel > sim.FUEL_DV / 2 + 1e-12) s = sim.step(s, dir);
  return coast(s);
}

// @spec SIM-ACC-002
test('burning to pass behind the planet boosts star-frame speed', () => {
  const s = burnHalfThenCoast('down');
  assert.equal(s.status, 'departed');
  assert.ok(sim.speedChange(s) > 0, `change ${sim.speedChange(s)}`);
});

// @spec SIM-ACC-003
test('burning to pass in front of the planet brakes star-frame speed', () => {
  const s = burnHalfThenCoast('up');
  assert.equal(s.status, 'departed');
  assert.ok(sim.speedChange(s) < 0, `change ${sim.speedChange(s)}`);
});
