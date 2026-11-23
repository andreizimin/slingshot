// Flight sim: pure physics, no DOM. Units: km, s, GM in km^3/s^2.
// @spec SIM-001

// @spec SIM-SCN-001
export const STAR_GM = 1.32712e11;
export const PLANET_GM = 1.26687e8;
export const PLANET_RADIUS = 71492;
export const ORBIT_RADIUS = 7.785e8;
export const DT = 30;
export const PLANET_SPEED = Math.sqrt(STAR_GM / ORBIT_RADIUS);
const OMEGA = PLANET_SPEED / ORBIT_RADIUS;

export const START_DISTANCE = 4.0e6;
export const V_INF = 10;
export const THRUST_ACCEL = 5e-5;
export const FUEL_DV = 5.0;

// @spec SIM-TIME-001
export const RATES = { paused: 0, slow: 120, normal: 480, fast: 1920 };

const DIRS = { up: [0, 1], down: [0, -1], left: [-1, 0], right: [1, 0] };

// @spec SIM-SCN-002
export function planetPosition(t) {
  const a = OMEGA * t;
  return { x: ORBIT_RADIUS * Math.cos(a), y: ORBIT_RADIUS * Math.sin(a) };
}

export function planetVelocity(t) {
  const a = OMEGA * t;
  return { x: -PLANET_SPEED * Math.sin(a), y: PLANET_SPEED * Math.cos(a) };
}

// @spec SIM-STEP-002
export function gravity(x, y, t) {
  const rs3 = Math.pow(x * x + y * y, 1.5);
  const p = planetPosition(t);
  const dx = x - p.x;
  const dy = y - p.y;
  const rp3 = Math.pow(dx * dx + dy * dy, 1.5);
  return {
    x: (-STAR_GM * x) / rs3 - (PLANET_GM * dx) / rp3,
    y: (-STAR_GM * y) / rs3 - (PLANET_GM * dy) / rp3,
  };
}

// @spec SIM-SCN-003, SIM-SCN-004
export function initialState() {
  const p = planetPosition(0);
  const pv = planetVelocity(0);
  const relSpeed = Math.sqrt(V_INF * V_INF + (2 * PLANET_GM) / START_DISTANCE);
  const pos = { x: p.x - START_DISTANCE, y: p.y };
  const vel = { x: pv.x + relSpeed, y: pv.y };
  return {
    t: 0,
    steps: 0,
    pos,
    vel,
    grav: gravity(pos.x, pos.y, 0),
    fuel: FUEL_DV,
    status: 'flying',
    closest: START_DISTANCE,
    startSpeed: Math.hypot(vel.x, vel.y),
  };
}

function clone(s) {
  return { ...s, pos: { ...s.pos }, vel: { ...s.vel }, grav: { ...s.grav } };
}

// Shared step arithmetic used by step, advance and predict. Mutates s.
// Returns true if thrust was applied.
function stepInPlace(s, thrustDir) {
  if (s.status !== 'flying') return false;

  let tx = 0;
  let ty = 0;
  const d = Object.prototype.hasOwnProperty.call(DIRS, thrustDir) ? DIRS[thrustDir] : null;
  if (d && s.fuel > 0) {
    const want = THRUST_ACCEL * DT;
    let spend;
    if (want >= s.fuel) {
      spend = s.fuel;
      s.fuel = 0;
    } else {
      spend = want;
      s.fuel -= want;
    }
    const a = spend / DT;
    tx = d[0] * a;
    ty = d[1] * a;
  }

  const ax = s.grav.x + tx;
  const ay = s.grav.y + ty;
  s.pos.x += s.vel.x * DT + 0.5 * ax * DT * DT;
  s.pos.y += s.vel.y * DT + 0.5 * ay * DT * DT;
  s.t += DT;
  s.steps += 1;
  const g = gravity(s.pos.x, s.pos.y, s.t);
  s.vel.x += 0.5 * (s.grav.x + g.x) * DT + tx * DT;
  s.vel.y += 0.5 * (s.grav.y + g.y) * DT + ty * DT;
  s.grav = g;

  const p = planetPosition(s.t);
  const r = Math.hypot(s.pos.x - p.x, s.pos.y - p.y);
  if (r < s.closest) s.closest = r;
  if (r < PLANET_RADIUS) s.status = 'crashed';
  else if (r > START_DISTANCE && s.closest < START_DISTANCE / 2) s.status = 'departed';

  return tx !== 0 || ty !== 0;
}

// @spec SIM-STEP-001, SIM-STEP-003, SIM-STEP-004, SIM-STEP-005, SIM-FUEL-001, SIM-FUEL-002, SIM-FUEL-003, SIM-FUEL-004, SIM-END-001, SIM-END-002
export function step(state, thrustDir) {
  const s = clone(state);
  stepInPlace(s, thrustDir);
  return s;
}

// @spec SIM-FUEL-005
export function planningBurn(state, thrustDir, dv) {
  const d = Object.prototype.hasOwnProperty.call(DIRS, thrustDir) ? DIRS[thrustDir] : null;
  if (state.status !== 'flying' || !d || state.fuel <= 0 || !(dv > 0)) return state;
  const s = clone(state);
  const spend = Math.min(dv, s.fuel);
  s.fuel = spend === s.fuel ? 0 : s.fuel - spend;
  s.vel.x += d[0] * spend;
  s.vel.y += d[1] * spend;
  return s;
}

// @spec SIM-TIME-004, SIM-TIME-005
export function advance(state, n, thrustDir) {
  const s = clone(state);
  const samples = [];
  let thrusted = false;
  for (let i = 0; i < n; i++) {
    if (s.status !== 'flying') break;
    if (stepInPlace(s, thrustDir)) thrusted = true;
    if (s.steps % 10 === 0) samples.push(planetRelativePosition(s));
  }
  return { state: s, samples, thrusted };
}

// @spec SIM-TIME-002, SIM-TIME-003
export function stepsForFrame(setting, elapsedSeconds, carry) {
  const e = Math.min(Math.max(elapsedSeconds, 0), 0.25);
  const total = (RATES[setting] ?? 0) * e + carry;
  const steps = Math.floor(total);
  return { steps, carry: total - steps };
}

// @spec SIM-PRED-001, SIM-PRED-002, SIM-PRED-003
export function predict(state, maxSteps = 20000) {
  const s = clone(state);
  const points = [];
  if (s.status !== 'flying') return { points, ending: s.status };
  let ending = 'horizon';
  for (let i = 1; i <= maxSteps; i++) {
    stepInPlace(s, null);
    const done = s.status !== 'flying';
    if (i % 20 === 0 || done) {
      points.push({ ship: { x: s.pos.x, y: s.pos.y }, planet: planetPosition(s.t), step: i });
    }
    if (done) {
      ending = s.status;
      break;
    }
  }
  return { points, ending };
}

// @spec SIM-READ-001
export function starFrameSpeed(state) {
  return Math.hypot(state.vel.x, state.vel.y);
}

export function planetFrameVelocity(state) {
  const pv = planetVelocity(state.t);
  return { x: state.vel.x - pv.x, y: state.vel.y - pv.y };
}

export function planetRelativePosition(state) {
  const p = planetPosition(state.t);
  return { x: state.pos.x - p.x, y: state.pos.y - p.y };
}

export function speedChange(state) {
  return starFrameSpeed(state) - state.startSpeed;
}
