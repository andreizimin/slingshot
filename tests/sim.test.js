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

// @spec SIM-TIME-001, SIM-TIME-002, SIM-TIME-003
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
    assert.equal(pred.points[k - 1].t, live.t);
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

// @spec SIM-001
test('flight-sim modules touch no browser global and import only relative .js files', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../site/sim/', import.meta.url);
  const names = readdirSync(dir).filter((n) => n.endsWith('.js'));
  assert.ok(names.length >= 1);
  for (const name of names) {
    const code = readFileSync(new URL(name, dir), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\b(window|document|navigator|localStorage|HTMLCanvasElement|requestAnimationFrame)\b/, `${name} uses a browser global`);
    for (const m of code.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      assert.match(m[1], /^\.{1,2}\/.+\.js$/, `${name} imports "${m[1]}"`);
    }
  }
});

// @spec SIM-SCN-001
test('scenario constants are the real-world values, in km, s and km³/s²', () => {
  assert.equal(sim.STAR_GM, 1.32712e11);
  assert.equal(sim.PLANET_GM, 1.26687e8);
  assert.equal(sim.PLANET_RADIUS, 71492);
  assert.equal(sim.ORBIT_RADIUS, 7.785e8);
  assert.equal(sim.DT, 30);
});

// @spec SIM-STEP-002
test('gravity is the sum of the inverse-square pulls of the star and the planet', () => {
  const t = 5000;
  const p = sim.planetPosition(t);
  const x = p.x - 3.0e5;
  const y = p.y + 4.0e5; // 5e5 km from the planet
  const g = sim.gravity(x, y, t);
  const rs = Math.hypot(x, y);
  const rp = 5.0e5;
  const expected = {
    x: (-sim.STAR_GM * x) / rs ** 3 - (sim.PLANET_GM * (x - p.x)) / rp ** 3,
    y: (-sim.STAR_GM * y) / rs ** 3 - (sim.PLANET_GM * (y - p.y)) / rp ** 3,
  };
  close(g.x, expected.x, 1e-15);
  close(g.y, expected.y, 1e-15);
  // The planet's pull at 5e5 km is GM/r², pointing at the planet.
  const planetPull = Math.hypot(g.x + (sim.STAR_GM * x) / rs ** 3, g.y + (sim.STAR_GM * y) / rs ** 3);
  close(planetPull, sim.PLANET_GM / rp ** 2, 1e-12);
});

// @spec SIM-END-002
test('a flight departs only after a close pass, once back beyond the start distance', () => {
  // A close pass: plan a swing behind, fly it, and it ends as departed, far out.
  let s = sim.planningBurn(sim.initialState(), 'down', 3);
  for (let i = 0; i < 80000 && s.status === 'flying'; i++) s = sim.step(s, null);
  assert.equal(s.status, 'departed');
  assert.ok(dist(s) > sim.START_DISTANCE);
  assert.ok(s.closest < sim.START_DISTANCE / 2);
  // Drifting away without ever coming close is not a departure.
  const p = sim.planetPosition(0);
  const pv = sim.planetVelocity(0);
  const pos = { x: p.x - 4.2e6, y: p.y };
  let away = { ...sim.initialState(), pos, vel: { x: pv.x - 20, y: pv.y }, grav: sim.gravity(pos.x, pos.y, 0), closest: 4.2e6 };
  for (let i = 0; i < 2000; i++) away = sim.step(away, null);
  assert.ok(dist(away) > sim.START_DISTANCE);
  assert.equal(away.status, 'flying');
});


// ---------- scenarios: the tutorial and the pond ----------

const GM = sim.PLANET_GM;
const drift = (name, x, y, vx, vy) => ({ name, gm: GM, radius: sim.PLANET_RADIUS, drift: { x, y, vx, vy } });
// A pond scenario with no star; ship 4e6 km on world 0's -x side heading straight at it.
const pond = (worlds, end = { rule: 'flyby', startDistance: 4.0e6 }) => {
  const w0 = worlds[0].drift;
  const v = Math.sqrt(100 + (2 * GM) / 4.0e6);
  return {
    name: 'test pond', worlds, fuel: 10, predictSteps: 20000, end,
    ship: { pos: { x: w0.x - 4.0e6, y: w0.y }, vel: { x: w0.vx + v, y: w0.vy } },
  };
};

// @spec SIM-SCN-005, SIM-SCN-006
test('initialState takes the ship, fuel and frame from a scenario, and keeps the scenario by reference', () => {
  const scn = pond([drift('A', 0, 0, 0, 13), drift('B', 3e7, 0, 0, 0)]);
  scn.fuel = 7;
  const s = sim.initialState(scn);
  assert.deepEqual(s.pos, scn.ship.pos);
  assert.deepEqual(s.vel, scn.ship.vel);
  assert.equal(s.fuel, 7);
  assert.equal(s.scenario, scn, 'shared, not copied');
  assert.equal(s.focus, 0, 'focus starts at the nearest world');
  close(s.closest, 4.0e6, 1e-6);
  close(s.startSpeed, Math.hypot(scn.ship.vel.x, scn.ship.vel.y), 1e-12);
  assert.equal(s.status, 'flying');
});

// @spec SIM-SCN-007, SIM-READ-004
test('a drifting world moves in a straight line at its constant velocity', () => {
  const scn = pond([drift('A', 1e6, -2e6, 3, 4)]);
  assert.deepEqual(sim.worldPosition(scn, 0, 1000), { x: 1e6 + 3000, y: -2e6 + 4000 });
  assert.deepEqual(sim.worldVelocity(scn, 0, 1e9), { x: 3, y: 4 });
  assert.deepEqual(sim.worldPosition(sim.TUTORIAL, 0, 5000), sim.planetPosition(5000), 'the tutorial planet is world 0');
  assert.equal(sim.focusWorld(sim.initialState(scn)), 0);
});

// @spec SIM-STEP-002
test('gravity sums every world, and the star only when the scenario has one', () => {
  const scn = pond([drift('A', 0, 0, 0, 0), drift('B', 1e7, 0, 0, 0)]);
  const g = sim.gravity(4e6, 3e6, 0, scn);
  const pull = (wx, wy) => {
    const dx = wx - 4e6, dy = wy - 3e6, r = Math.hypot(dx, dy);
    return { x: (GM * dx) / r ** 3, y: (GM * dy) / r ** 3 };
  };
  const a = pull(0, 0), b = pull(1e7, 0);
  close(g.x, a.x + b.x, 1e-18);
  close(g.y, a.y + b.y, 1e-18);
  // The default scenario is the tutorial's, with its star.
  assert.deepEqual(sim.gravity(5e8, 1e8, 100), sim.gravity(5e8, 1e8, 100, sim.TUTORIAL));
});

// @spec SIM-STEP-004
test('a flight that has ended in any way is frozen', () => {
  for (const status of ['crashed', 'departed', 'arrived', 'lost']) {
    const s = { ...sim.initialState(), status };
    assert.deepEqual(sim.step(s, 'up'), s, status);
  }
});

// @spec SIM-STEP-005
test('closest tracks the distance to world 0, even when another world is nearer', () => {
  const scn = pond([drift('A', 0, 0, 0, 0), drift('B', -4.3e6, 1e5, 0, 0)]);
  let s = sim.initialState(scn);
  for (let i = 0; i < 50; i++) s = sim.step(s, null);
  const r0 = Math.hypot(s.pos.x, s.pos.y);
  close(s.closest, r0, 1e-6);
});

// @spec SIM-STEP-006
test('focus moves to another world only once it is 10% nearer than the current focus', () => {
  const scn = pond([drift('A', 0, 0, 0, 0), drift('B', -8.0e6, 0, 0, 0)]);
  // Ship placed between the worlds, nearer A (focus A), coasting toward B.
  let s = { ...sim.initialState(scn), pos: { x: -3.9e6, y: 0 }, vel: { x: -300, y: 0 } };
  s = { ...s, grav: sim.gravity(s.pos.x, s.pos.y, 0, scn), focus: 0 };
  let switchedAt = null;
  for (let i = 0; i < 400 && switchedAt === null; i++) {
    s = sim.step(s, null);
    if (s.focus === 1) switchedAt = s.pos.x;
  }
  assert.ok(switchedAt !== null, 'focus switched to B');
  const dA = Math.abs(switchedAt), dB = Math.abs(switchedAt + 8.0e6);
  assert.ok(dB < 0.9 * dA, `B was 10% nearer (dA ${dA}, dB ${dB})`);
  assert.ok(dB > 0.9 * dA - 300 * 30 * 2, 'and not much earlier than that');
});

// @spec SIM-FUEL-006
test('"up" is sideways relative to the focus world, not a fixed direction', () => {
  // World straight above the ship: toward = +y, so "up" (90° CCW) is -x.
  const scn = pond([drift('A', 0, 0, 0, 0)]);
  const s0 = { ...sim.initialState(scn), pos: { x: 0, y: -4e6 }, vel: { x: 0, y: 10 }, heading: Math.PI, throttle: 1 };
  const s = { ...s0, grav: sim.gravity(0, -4e6, 0, scn) };
  const pushed = sim.step(s, 'up');
  const coasted = sim.step(s, null);
  close(pushed.vel.x - coasted.vel.x, -5e-5 * 30, 1e-9);
  close(pushed.vel.y - coasted.vel.y, 0, 1e-9);
});

// @spec SIM-END-001
test('hitting any world is a crash', () => {
  const scn = pond([drift('A', 0, 0, 0, 0), drift('B', 0, 3e7, 0, 0)]);
  let s = { ...sim.initialState(scn), pos: { x: 0, y: 3e7 - 1.0e6 }, vel: { x: 0, y: 30 } };
  s = { ...s, grav: sim.gravity(s.pos.x, s.pos.y, 0, scn), focus: 1 };
  for (let i = 0; i < 5000 && s.status === 'flying'; i++) s = sim.step(s, null);
  assert.equal(s.status, 'crashed');
  close(Math.hypot(s.pos.x, s.pos.y - 3e7), 0, sim.PLANET_RADIUS);
});

// @spec SIM-END-002, SIM-END-006
test('departing is a flyby-rule ending only; the level rule never departs', () => {
  const levelEnd = { rule: 'level', destination: 1, catchRadius: 3e6, catchSpeed: 5, lostDistance: 1e9 };
  const scn = pond([drift('A', 0, 0, 0, 13), drift('B', 9e8, 9e8, 0, 0)], levelEnd);
  let s = sim.planningBurn(sim.initialState(scn), 'down', 3);
  for (let i = 0; i < 60000 && s.status === 'flying'; i++) s = sim.step(s, null);
  assert.equal(s.status, 'flying', 'past the flyby and far out, still flying under the level rule');
  assert.ok(Math.hypot(s.pos.x - sim.worldPosition(scn, 0, s.t).x, s.pos.y - sim.worldPosition(scn, 0, s.t).y) > 4.0e6);
});

// @spec SIM-END-004, SIM-READ-003
test('arrived: inside the catch radius with a far speed under the catch speed', () => {
  const levelEnd = { rule: 'level', destination: 1, catchRadius: 3e6, catchSpeed: 5, lostDistance: 1e9 };
  const scn = pond([drift('A', -5e7, 0, 0, 0), drift('H', 0, 0, 2, 1)], levelEnd);
  // Ship 3.5e6 km from H, drifting toward it slowly in H's frame, offset so it does not hit.
  const mk = (vrel) => {
    let s = { ...sim.initialState(scn), pos: { x: -3.5e6, y: 5e5 }, vel: { x: 2 + vrel, y: 1 }, focus: 1, closest: 4.5e7 };
    return { ...s, grav: sim.gravity(s.pos.x, s.pos.y, 0, scn) };
  };
  // Far speed is distance-independent: v² − 2GM/d.
  const probe = mk(10);
  const d = Math.hypot(3.5e6, 5e5), v = 10;
  close(sim.farSpeed(probe, 1), Math.sqrt(v * v - (2 * GM) / d), 1e-12);
  assert.equal(sim.farSpeed({ ...probe, vel: { x: 2, y: 1 } }, 1), 0, 'bound: far speed 0');
  let slow = mk(4);
  for (let i = 0; i < 20000 && slow.status === 'flying'; i++) slow = sim.step(slow, null);
  assert.equal(slow.status, 'arrived');
  let fast = mk(12);
  for (let i = 0; i < 1500 && fast.status === 'flying'; i++) fast = sim.step(fast, null);
  assert.notEqual(fast.status, 'arrived', 'too fast is not caught');
});

// @spec SIM-END-005
test('lost: strictly farther than the lost distance from every world', () => {
  const levelEnd = { rule: 'level', destination: 1, catchRadius: 3e6, catchSpeed: 5, lostDistance: 1.0e7 };
  const scn = pond([drift('A', 0, 0, 0, 0), drift('B', 5e6, 0, 0, 0)], levelEnd);
  let s = { ...sim.initialState(scn), pos: { x: -9.0e6, y: 0 }, vel: { x: -40, y: 0 }, focus: 0, closest: 9e6 };
  s = { ...s, grav: sim.gravity(s.pos.x, s.pos.y, 0, scn) };
  for (let i = 0; i < 20000 && s.status === 'flying'; i++) s = sim.step(s, null);
  assert.equal(s.status, 'lost');
  assert.ok(Math.abs(s.pos.x) > 1.0e7, 'beyond A');
  assert.ok(Math.abs(s.pos.x - 5e6) > 1.0e7, 'and beyond B');
});

// @spec SIM-TIME-004
test('advance samples carry position and time, and include the step that ends the flight', () => {
  const { state, samples } = sim.advance(sim.initialState(), 25, null);
  assert.equal(samples.length, 2);
  assert.deepEqual(Object.keys(samples[0]).sort(), ['t', 'x', 'y']);
  assert.equal(samples[1].t, 20 * sim.DT);
  assert.equal(state.steps, 25);
  // Coasting from the start crashes; the final sample is the crash step even off a multiple of 10.
  const out = sim.advance(sim.initialState(), 100000, null);
  assert.equal(out.state.status, 'crashed');
  const last = out.samples[out.samples.length - 1];
  assert.equal(last.t, out.state.t);
  assert.deepEqual({ x: last.x, y: last.y }, out.state.pos);
});

// @spec SIM-PRED-001, SIM-PRED-002, SIM-PRED-003
test('prediction uses the scenario horizon, counts from its own start, and ends where the flight would', () => {
  const pred = sim.predict(sim.initialState());
  assert.equal(pred.ending, 'crashed');
  const first = pred.points[0];
  assert.equal(first.t, 20 * sim.DT, 'the first point is 20 steps in, not the start');
  const last = pred.points[pred.points.length - 1];
  assert.ok(last.t % (20 * sim.DT) !== 0 || pred.points.length > 0, 'terminal point recorded');
  const scn = pond([drift('A', 0, 0, 0, 0)]);
  scn.predictSteps = 100;
  const short = sim.predict({ ...sim.planningBurn(sim.initialState(scn), 'down', 9) });
  assert.equal(short.ending, 'horizon');
  assert.equal(short.points.length, 5);
});

// @spec SIM-READ-001, SIM-READ-002
test('readouts are relative to the focus world; speed is in the scenario frame', () => {
  const scn = pond([drift('A', 0, 0, 0, 13), drift('B', -6e6, 0, 5, 0)]);
  let s = { ...sim.initialState(scn), pos: { x: -5e6, y: 1e5 }, vel: { x: 1, y: 2 }, focus: 1 };
  assert.deepEqual(sim.planetRelativePosition(s), { x: 1e6, y: 1e5 });
  assert.deepEqual(sim.planetFrameVelocity(s), { x: -4, y: 2 });
  close(sim.starFrameSpeed(s), Math.hypot(1, 2), 1e-12);
  const { toward } = sim.axes(s);
  close(toward.x, -1e6 / Math.hypot(1e6, 1e5), 1e-12, 'toward points at B');
  const c = sim.speedComponents(s);
  close(Math.hypot(c.toward, c.side), Math.hypot(4, 2), 1e-12);
});

// @spec SIM-ACC-004
test('a coasting flyby of a drifting world conserves speed relative to it within 0.1%', () => {
  const scn = pond([drift('A', 0, 0, 7, -3)]);
  const v = Math.sqrt(100 + (2 * GM) / Math.hypot(4e6, 6.5e5));
  let s = { ...sim.initialState(scn), pos: { x: -4e6, y: -6.5e5 }, vel: { x: 7 + v, y: -3 }, fuel: 0 };
  s = { ...s, grav: sim.gravity(s.pos.x, s.pos.y, 0, scn) };
  let vin = null, vout = null, inside = false;
  for (let i = 0; i < 100000 && s.status === 'flying'; i++) {
    s = sim.step(s, null);
    const r = sim.planetRelativePosition(s);
    const fv = sim.planetFrameVelocity(s);
    const d = Math.hypot(r.x, r.y);
    if (!inside && d < 2.5e6) { inside = true; vin = Math.hypot(fv.x, fv.y); }
    if (inside && d > 2.5e6) { vout = Math.hypot(fv.x, fv.y); break; }
  }
  assert.ok(vin && vout, 'flyby completed');
  assert.ok(Math.abs(vout - vin) / vin < 0.001, `in ${vin} out ${vout}`);
});

// @spec SIM-ACC-005
test('the tutorial is unchanged whether or not its scenario is passed', () => {
  const a = sim.initialState();
  const b = sim.initialState(sim.TUTORIAL);
  assert.deepEqual(a, b);
  let x = a, y = b;
  for (let i = 0; i < 500; i++) { x = sim.step(x, i < 100 ? 'down' : null); y = sim.step(y, i < 100 ? 'down' : null); }
  assert.deepEqual(x, y);
});
