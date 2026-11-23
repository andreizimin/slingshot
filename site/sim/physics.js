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
export const FUEL_DV = 10.0;
export const PLAN_RATE = 5 / 3; // km/s of planned delta-v per real second of holding while paused
export const TURN_RATE = Math.PI / 480;        // rad per step: a half-turn takes 4 sim hours (1 s at Normal)
export const SPOOL_STEPS = 120;                // steps for the engine to reach full thrust (0.25 s at Normal)
export const ALIGN_TOLERANCE = (10 * Math.PI) / 180; // engine fires only when the nose is within 10°

// @spec SIM-TIME-001
export const RATES = { paused: 0, slow: 200, normal: 800, fast: 3300 };


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
    heading: 0,               // nose direction, radians; starts facing the planet (+x)
    throttle: 0,              // 0..1, spools up while firing
    planDv: 0,                // queued sideways manoeuvre, signed km/s (+ = 'up' side)
  };
}

function clone(s) {
  return { ...s, pos: { ...s.pos }, vel: { ...s.vel }, grav: { ...s.grav } };
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Only sideways pushes exist: 'up' is +1 along the sideways axis, 'down' is −1.
const SIDE_SIGN = { up: 1, down: -1 };
const sideSign = (thrustDir) => (Object.prototype.hasOwnProperty.call(SIDE_SIGN, thrustDir) ? SIDE_SIGN[thrustDir] : 0);

// Unit vectors at the ship: toward the planet, and sideways (90° counter-clockwise from it).
// At the default start the planet is at +x from the ship, so sideways is +y (screen up).
// @spec SIM-READ-002
export function axes(state) {
  const p = planetPosition(state.t);
  const dx = p.x - state.pos.x;
  const dy = p.y - state.pos.y;
  const d = Math.hypot(dx, dy) || 1;
  const toward = { x: dx / d, y: dy / d };
  return { toward, side: { x: -toward.y, y: toward.x } };
}

// Planet-frame velocity split into speed toward the planet and sideways speed.
// @spec SIM-READ-002
export function speedComponents(state) {
  const v = planetFrameVelocity(state);
  const { toward, side } = axes(state);
  return { toward: v.x * toward.x + v.y * toward.y, side: v.x * side.x + v.y * side.y };
}

// Shared step arithmetic used by step, advance and predict. Mutates s.
// Returns true if thrust was applied.
// @spec SIM-FUEL-006, SIM-FUEL-007
function stepInPlace(s, thrustDir) {
  if (s.status !== 'flying') return false;

  // Sideways push wanted: a held direction, else a queued manoeuvre.
  const manualSign = sideSign(thrustDir);
  const executingBurn = manualSign === 0 && s.planDv !== 0;
  const sign = manualSign || (executingBurn ? Math.sign(s.planDv) : 0);
  let want = null;
  if (sign !== 0) {
    const { side } = axes(s);
    want = [side.x * sign, side.y * sign];
  }

  // Turn toward it at a limited rate, then spool the engine up once aligned.
  let firing = false;
  if (want) {
    const target = Math.atan2(want[1], want[0]);
    const diff = wrapAngle(target - s.heading);
    s.heading = wrapAngle(s.heading + Math.max(-TURN_RATE, Math.min(TURN_RATE, diff)));
    firing = Math.abs(wrapAngle(target - s.heading)) < ALIGN_TOLERANCE && s.fuel > 0;
  }
  s.throttle = firing ? Math.min(1, s.throttle + 1 / SPOOL_STEPS) : 0;

  let tx = 0;
  let ty = 0;
  if (s.throttle > 0) {
    let spend = s.throttle * THRUST_ACCEL * DT;
    if (executingBurn) spend = Math.min(spend, Math.abs(s.planDv));
    if (spend >= s.fuel) {
      spend = s.fuel;
      s.fuel = 0;
    } else {
      s.fuel -= spend;
    }
    if (executingBurn) {
      s.planDv -= sign * spend;
      if (Math.abs(s.planDv) <= 1e-12 || s.fuel === 0) { s.planDv = 0; s.throttle = 0; }
    }
    const a = spend / DT;
    tx = Math.cos(s.heading) * a;
    ty = Math.sin(s.heading) * a;
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

// Adjusts the queued sideways manoeuvre (no time passes, no fuel spent yet).
// Fully reversible: pushing up then down by the same amount cancels out.
// The ship flies the net plan later: turn, spool up, burn until delivered.
// @spec SIM-FUEL-005
export function planningBurn(state, thrustDir, dv) {
  const sign = sideSign(thrustDir);
  if (state.status !== 'flying' || sign === 0 || !(dv > 0)) return state;
  const s = clone(state);
  const next = s.planDv + sign * dv;
  s.planDv = Math.max(-s.fuel, Math.min(s.fuel, next));
  if (Math.abs(s.planDv) < 1e-12) s.planDv = 0;
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
