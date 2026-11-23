// Cockpit: draws the flight sim and turns input into commands. Presentation only.
import * as sim from '../sim/physics.js';

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const el = {
  speed: document.getElementById('speed'),
  change: document.getElementById('change'),
  fuel: document.getElementById('fuel-fill'),
  planned: document.getElementById('fuel-planned'),
  message: document.getElementById('message'),
  buttons: [...document.querySelectorAll('.time button')],
};

const TRAIL_MAX = 3000;
const SHIP_HALF_H = 6; // 12 px tall rocket

let state;
let trail;
let prediction;
let setting;          // 'paused' | 'slow' | 'normal' | 'fast'
let resumeTo = 'normal';
let ready;
let carry = 0;
let scale = 1000;     // km per CSS px
let lastTime = null;
let thrustedThisFrame = false;
let thrustDirThisFrame = null;
const held = [];      // arrow stack, most recent last
let plan = null;      // planned state while paused (burns applied, not yet committed)
let drag = null;     // { id, x0, y0, x, y } while a pointer is pressed on the canvas
const DRAG_DEADZONE = 24;
const COARSE = window.matchMedia('(pointer: coarse)').matches;

let W = 0;
let H = 0;
const stars = Array.from({ length: 140 }, (_, i) => {
  const r = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { x: r(1), y: r(2), s: 0.6 + r(3) * 1.1 };
});

// @spec COCKPIT-CTL-005, COCKPIT-CTL-007, COCKPIT-TRAIL-002, COCKPIT-CAM-003
function reset() {
  state = sim.initialState();
  plan = null;
  trail = [];
  prediction = sim.predict(state);
  setting = 'paused';
  ready = true;
  carry = 0;
  scale = targetScale();
  updateButtons();
}

// @spec COCKPIT-CAM-004
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// @spec COCKPIT-CAM-002, COCKPIT-CAM-005
function targetScale() {
  const r = sim.planetRelativePosition(state);
  const d = Math.hypot(r.x, r.y);
  const m = Math.min(W, H) || 800;
  let s = Math.min(20000, Math.max(1000, d / (0.35 * m)));
  // Keep the ship inside the area clear of the HUD.
  const availUp = Math.max(40, H / 2 - 170);
  const availDown = Math.max(40, H / 2 - 110);
  const availX = Math.max(40, W / 2 - (W < 600 ? 60 : 110));
  s = Math.max(s, Math.abs(r.x) / availX, r.y > 0 ? r.y / availUp : -r.y / availDown);
  return s;
}

// @spec COCKPIT-CAM-001
function toScreen(rx, ry) {
  return [W / 2 + rx / scale, H / 2 - ry / scale];
}

// ---------- input ----------

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

function setSetting(next) {
  if (next === 'paused') {
    if (setting !== 'paused') resumeTo = setting;
    setting = 'paused';
  } else {
    // @spec COCKPIT-CTL-011 — resuming commits the planned course and charges its fuel.
    if (plan) { state = plan; plan = null; }
    setting = next;
    resumeTo = next;
    ready = false;
  }
  updateButtons();
}

// @spec COCKPIT-CTL-003
function togglePause() {
  if (setting === 'paused') setSetting(resumeTo);
  else setSetting('paused');
}

// @spec COCKPIT-CTL-001, COCKPIT-CTL-002, COCKPIT-CTL-003, COCKPIT-CTL-004, COCKPIT-CTL-006
window.addEventListener('keydown', (e) => {
  const dir = ARROWS[e.key];
  if (dir) {
    e.preventDefault();
    if (!held.includes(dir)) held.push(dir);
    return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    if (!e.repeat) togglePause();
  } else if (e.key === '1') setSetting('paused');
  else if (e.key === '2') setSetting('slow');
  else if (e.key === '3') setSetting('normal');
  else if (e.key === '4') setSetting('fast');
  else if (e.key === 'r' || e.key === 'R') reset();
});

window.addEventListener('keyup', (e) => {
  const dir = ARROWS[e.key];
  if (!dir) return;
  const i = held.indexOf(dir);
  if (i >= 0) held.splice(i, 1);
});

window.addEventListener('blur', () => { held.length = 0; drag = null; });

// @spec COCKPIT-CTL-009, COCKPIT-CTL-010 — drag to push, one path for touch, mouse and pen.
canvas.addEventListener('pointerdown', (e) => {
  if (drag) return;
  e.preventDefault();
  drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.x = e.clientX;
  drag.y = e.clientY;
});
const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('lostpointercapture', endDrag);

function dragDir() {
  if (!drag) return null;
  const dx = drag.x - drag.x0;
  const dy = drag.y - drag.y0;
  // Only sideways pushes exist, so only the vertical part of a drag counts.
  if (Math.abs(dy) <= DRAG_DEADZONE) return null;
  return dy < 0 ? 'up' : 'down';
}

// @spec COCKPIT-DRAW-007
function drawDragHint() {
  if (!drag) return;
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(drag.x0, drag.y0, DRAG_DEADZONE, 0, Math.PI * 2);
  ctx.stroke();
  if (dragDir()) arrow(drag.x0, drag.y0, drag.x, drag.y, 'rgba(251, 146, 60, 0.8)', 3);
}

// @spec COCKPIT-MOB-002
if (COARSE) document.getElementById('help').textContent = 'Drag up/down: steer · buttons: speed';
window.addEventListener('resize', resize);

for (const b of el.buttons) {
  b.addEventListener('click', () => {
    setSetting(b.dataset.setting);
    b.blur();
  });
}

function updateButtons() {
  for (const b of el.buttons) b.classList.toggle('active', b.dataset.setting === setting);
}

// ---------- drawing ----------

function drawBackground() {
  ctx.fillStyle = '#0b1530';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(203, 213, 225, 0.55)';
  for (const s of stars) {
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function arrow(x1, y1, x2, y2, color, width) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.moveTo(x2 - 13 * Math.cos(a - 0.6), y2 - 13 * Math.sin(a - 0.6));
  ctx.lineTo(x2, y2);
  ctx.lineTo(x2 - 13 * Math.cos(a + 0.6), y2 - 13 * Math.sin(a + 0.6));
  ctx.stroke();
}

// Sun badge: an arrow-shaped bubble with a little sun inside, parked under the fuel bar
// (clear of the flight area), pointing toward the Sun from the planet.
// @spec COCKPIT-DRAW-005
function drawStarArrow() {
  const narrow = W < 600;
  const p = sim.planetPosition(state.t);
  const a = Math.atan2(p.y, -p.x); // screen angle toward the Sun (world origin), y flipped
  const r = narrow ? 18 : 22;
  // Park the badge on the screen edge along the planet→Sun line (behind the ship at the start),
  // kept clear of the HUD bands at top and bottom.
  const inset = r * 1.9;
  const top = narrow ? 150 : 190;
  const bottom = H - (narrow ? 100 : 120);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const tx = ux < 0 ? (inset - W / 2) / ux : ux > 0 ? (W - inset - W / 2) / ux : Infinity;
  const ty = uy < 0 ? (top - H / 2) / uy : uy > 0 ? (bottom - H / 2) / uy : Infinity;
  const t = Math.min(tx, ty);
  const cx = W / 2 + ux * t;
  const cy = H / 2 + uy * t;

  ctx.save();
  ctx.translate(cx, cy);
  // Bubble with a pointed tip toward the Sun.
  ctx.rotate(a);
  ctx.fillStyle = 'rgba(22, 33, 63, 0.95)';
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI * 0.22, Math.PI * 1.78);
  ctx.lineTo(r * 1.75, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.rotate(-a);
  // The sun: disc plus short rays.
  ctx.fillStyle = '#fcd34d';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fcd34d';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const t = (i * Math.PI) / 4;
    ctx.beginPath();
    ctx.moveTo(Math.cos(t) * r * 0.58, Math.sin(t) * r * 0.58);
    ctx.lineTo(Math.cos(t) * r * 0.78, Math.sin(t) * r * 0.78);
    ctx.stroke();
  }
  ctx.restore();

  ctx.fillStyle = '#fcd34d';
  ctx.font = `700 ${narrow ? 12 : 13}px Nunito, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('Sun', cx, cy + r + 16);
  ctx.textAlign = 'left';
}

// Small dark pill behind a label so it reads cleanly over stars and lines.
function pill(text, x, y, color, align = 'left') {
  ctx.font = '800 13px Nunito, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 14;
  const h = 22;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.fillStyle = 'rgba(11, 21, 48, 0.88)';
  ctx.beginPath();
  ctx.roundRect(left, y - h / 2, w, h, 11);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(text, left + 7, y + 4.5);
}

// Paths (trail, prediction) never cross the drawn planet: points that fall inside an
// inflated planet are pushed out to its drawn edge. Presentation only.
// @spec COCKPIT-DRAW-010
// Smooth radial remap: a point d px from the planet centre is drawn at sqrt(d² + K²),
// where K is chosen so the true surface lands just outside the drawn planet. Far away the
// shift vanishes; close in, the curve swells smoothly into an elliptical swing.
function pathPoint(rx, ry) {
  const [x, y] = toScreen(rx, ry);
  const trueR = sim.PLANET_RADIUS / scale;
  const drawR = planetDrawRadius() + 6;
  const K2 = Math.max(0, drawR * drawR - trueR * trueR);
  const dx = x - W / 2;
  const dy = y - H / 2;
  const d = Math.hypot(dx, dy);
  if (d === 0 || K2 === 0) return [x, y];
  const k = Math.sqrt(d * d + K2) / d;
  return [W / 2 + dx * k, H / 2 + dy * k];
}

// @spec COCKPIT-DRAW-006
function drawTrail() {
  if (trail.length < 2) return;
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  trail.forEach((p, i) => {
    const [x, y] = pathPoint(p.x, p.y);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  const r = sim.planetRelativePosition(state);
  ctx.lineTo(...shipScreenPos(r));
  ctx.stroke();
}

// The prediction is a planning tool: shown only while paused.
// @spec COCKPIT-PRED-002
function drawPrediction() {
  if (setting !== 'paused') return;
  if (!prediction || prediction.points.length === 0) return;
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 9]);
  ctx.beginPath();
  const r = sim.planetRelativePosition(state);
  ctx.moveTo(...shipScreenPos(r));
  for (const p of prediction.points) {
    ctx.lineTo(...pathPoint(p.ship.x - p.planet.x, p.ship.y - p.planet.y));
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function planetDrawRadius() {
  return Math.max(sim.PLANET_RADIUS / scale, 24);
}

// @spec COCKPIT-DRAW-002
function drawPlanet() {
  const R = planetDrawRadius();
  const cx = W / 2;
  const cy = H / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = '#d9a066';
  ctx.fill();
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#a5683a';
  ctx.lineWidth = R * 0.17;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy - R * 0.33);
  ctx.quadraticCurveTo(cx, cy - R * 0.5, cx + R, cy - R * 0.33);
  ctx.stroke();
  ctx.strokeStyle = '#f3d3a6';
  ctx.lineWidth = R * 0.14;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy + R * 0.22);
  ctx.quadraticCurveTo(cx, cy + R * 0.38, cx + R, cy + R * 0.22);
  ctx.stroke();
  ctx.fillStyle = '#b4532a';
  ctx.beginPath();
  ctx.ellipse(cx + R * 0.39, cy + R * 0.44, R * 0.2, R * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Planet-motion cue: world +y is screen up.
  arrow(cx, cy - R - 10, cx, cy - R - 62, '#fbbf24', 3);
  ctx.fillStyle = '#fcd34d';
  ctx.font = '700 15px Nunito, system-ui, sans-serif';
  ctx.fillText('planet moving', cx + 18, cy - R - 54);
  ctx.fillText('this way', cx + 18, cy - R - 36);
}

// @spec COCKPIT-DRAW-001, COCKPIT-DRAW-003, COCKPIT-DRAW-004
// Where the ship is painted: its true spot, pushed out of an inflated planet if needed.
function shipScreenPos(r) {
  // Same smooth remap as the paths, so the ship always sits on its trail.
  // A crashed ship is drawn at its true spot, touching the planet.
  if (state.status === 'crashed') return toScreen(r.x, r.y);
  return pathPoint(r.x, r.y);
}

function drawShip() {
  const r = sim.planetRelativePosition(state);
  const [x, y] = shipScreenPos(r);
  // Nose follows the ship's heading (world +y is screen up, so negate).
  const angle = -state.heading;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Thruster flame out of the tail, sized by throttle: visible spool-up.
  if (state.throttle > 0) {
    const len = 8 + 22 * state.throttle + Math.random() * 5 * state.throttle;
    const half = 3 + 3 * state.throttle;
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.moveTo(-14, -half);
    ctx.lineTo(-14 - len, 0);
    ctx.lineTo(-14, half);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.moveTo(-14, -half * 0.5);
    ctx.lineTo(-14 - len * 0.55, 0);
    ctx.lineTo(-14, half * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.moveTo(-14, -SHIP_HALF_H); ctx.lineTo(-18, -11); ctx.lineTo(-9, -SHIP_HALF_H);
  ctx.moveTo(-14, SHIP_HALF_H); ctx.lineTo(-18, 11); ctx.lineTo(-9, SHIP_HALF_H);
  ctx.fill();
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(-14, -SHIP_HALF_H);
  ctx.lineTo(8, -SHIP_HALF_H);
  ctx.quadraticCurveTo(16, 0, 8, SHIP_HALF_H);
  ctx.lineTo(-14, SHIP_HALF_H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Two speed arrows from the ship: toward the planet, and sideways (the part you control).
// While planning, the sideways speed the plan will produce is shown dashed.
// @spec COCKPIT-DRAW-008
const TOWARD_PX_PER_KMS = 4;   // toward-planet speed is large; keep its arrow modest
const SIDE_PX_PER_KMS = 14;    // sideways speed is the one you steer; make it big
const SIDE_MIN_PX = 30;        // never let a non-zero sideways arrow hide under the ship
const SHIP_CLEAR_PX = 16;      // arrows start just outside the ship body
function drawSpeedArrows() {
  if (state.status !== 'flying') return;
  const rel = sim.planetRelativePosition(state);
  const [x, y] = shipScreenPos(rel);
  const { toward, side } = sim.axes(state);
  const c = sim.speedComponents(state);
  const s = (u) => [u.x, -u.y]; // world → screen direction
  const [tx, ty] = s(toward);
  const [sx, sy] = s(side);

  // Toward-planet arrow: thin, quiet grey.
  if (Math.abs(c.toward) > 0.05) {
    const dir = Math.sign(c.toward);
    const len = SHIP_CLEAR_PX + Math.abs(c.toward) * TOWARD_PX_PER_KMS;
    const x0 = x + tx * dir * SHIP_CLEAR_PX, y0 = y + ty * dir * SHIP_CLEAR_PX;
    const x1 = x + tx * dir * len, y1 = y + ty * dir * len;
    arrow(x0, y0, x1, y1, 'rgba(203, 213, 225, 0.7)', 2);
    // Label under the middle of the arrow, so it never sits on the planet.
    pill(`${Math.abs(c.toward).toFixed(1)} km/s ${dir > 0 ? 'toward planet' : 'away'}`,
      (x0 + x1) / 2 - ty * 22, (y0 + y1) / 2 + tx * 22, '#cbd5e1', 'center');
  }

  // Sideways arrow: thick orange, the one you control. A planned value is dashed on top,
  // but only while paused and planning; once flying, only actual speeds are shown.
  const planDv = plan ? plan.planDv : 0;
  const sideLen = (v) => (Math.abs(v) < 0.05 ? 0 : Math.max(SIDE_MIN_PX, SHIP_CLEAR_PX + Math.abs(v) * SIDE_PX_PER_KMS));
  const drawSide = (v, color, width, dashed) => {
    const len = sideLen(v);
    if (!len) return null;
    const d = Math.sign(v);
    const x0 = x + sx * d * SHIP_CLEAR_PX * 0.6, y0 = y + sy * d * SHIP_CLEAR_PX * 0.6;
    const x1 = x + sx * d * len, y1 = y + sy * d * len;
    if (dashed) ctx.setLineDash([7, 6]);
    arrow(x0, y0, x1, y1, color, width);
    ctx.setLineDash([]);
    return [x1, y1, d];
  };
  const now = drawSide(c.side, '#fb923c', 5, false);
  const planned = planDv !== 0 ? drawSide(c.side + planDv, '#fdba74', 4, true) : null;
  const labelAt = planned ?? now;
  const value = planDv !== 0 ? c.side + planDv : c.side;
  if (labelAt) {
    const [lx, ly, d] = labelAt;
    pill(`${Math.abs(value).toFixed(1)} km/s sideways${planDv !== 0 ? ' (planned)' : ''}`,
      lx + sx * d * 14, ly + sy * d * 14, '#fdba74', 'center');
  }
}

// Speed tuner: three sliders for steps per real second, applied live.
// @spec COCKPIT-TUNE-001
(function speedTuner() {
  const panel = document.getElementById('tuner');
  const toggle = document.getElementById('tuner-toggle');
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.blur(); });
  for (const name of ['slow', 'normal', 'fast']) {
    const input = document.getElementById(`tune-${name}`);
    const out = document.getElementById(`tune-${name}-val`);
    input.value = sim.RATES[name];
    out.textContent = sim.RATES[name];
    input.addEventListener('input', () => {
      sim.RATES[name] = Number(input.value);
      out.textContent = input.value;
    });
  }
})();

const fmt = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;

// @spec COCKPIT-HUD-001, COCKPIT-HUD-002, COCKPIT-HUD-003, COCKPIT-HUD-006
function updateHud() {
  el.speed.textContent = sim.starFrameSpeed(state).toFixed(1);
  const c = sim.speedChange(state);
  el.change.className = `change ${c > 0.05 ? 'up' : c < -0.05 ? 'down' : 'flat'}`;
  el.change.textContent = `${c < 0 ? '▼' : '▲'} ${fmt(c)}`;
  // @spec COCKPIT-HUD-007 — solid = fuel left after the plan; faded = fuel the plan will spend.
  const f = state.fuel / sim.FUEL_DV;
  const queued = Math.abs((plan ?? state).planDv);
  const after = Math.max(0, state.fuel - queued) / sim.FUEL_DV;
  el.fuel.style.width = `${(after * 100).toFixed(1)}%`;
  el.planned.style.width = `${(f * 100).toFixed(1)}%`;
  el.fuel.classList.toggle('low', after < 0.2);
}

// @spec COCKPIT-MSG-001, COCKPIT-MSG-002, COCKPIT-MSG-003
function updateMessage() {
  let html = null;
  if (state.status === 'crashed') {
    html = '<span class="big">Bonk!</span>You hit the planet. Press R to try again.';
  } else if (state.status === 'departed') {
    const c = sim.speedChange(state);
    const fuel = Math.round((state.fuel / sim.FUEL_DV) * 100);
    const head = c > 0.05
      ? `<span class="big up">Boost! ${fmt(c)} km/s</span>`
      : c < -0.05
        ? `<span class="big down">Brake! ${fmt(c)} km/s</span>`
        : '<span class="big">No change</span>';
    html = `${head}Fuel left: ${fuel}%<br>Press R to fly again.`;
  } else if (ready) {
    html = COARSE
      ? 'Drag up or down to pick a side, then tap Normal to go.'
      : 'Push up or down (arrows or drag) to pick a side, then press Space to go.';
  }
  if (html === null) {
    el.message.hidden = true;
  } else {
    if (el.message.innerHTML !== html) el.message.innerHTML = html;
    el.message.hidden = false;
  }
}

// ---------- loop ----------

// @spec COCKPIT-LOOP-001, COCKPIT-TRAIL-001, COCKPIT-PRED-001
function frame(now) {
  const elapsed = lastTime === null ? 0 : (now - lastTime) / 1000;
  lastTime = now;

  const dir = held.length ? held[held.length - 1] : dragDir();
  const r = sim.stepsForFrame(setting, elapsed, carry);
  carry = r.carry;
  thrustedThisFrame = false;
  thrustDirThisFrame = dir;
  if (r.steps > 0) {
    const out = sim.advance(state, r.steps, dir);
    state = out.state;
    thrustedThisFrame = out.thrusted;
    for (const p of out.samples) trail.push(p);
    if (trail.length > TRAIL_MAX) trail.splice(0, trail.length - TRAIL_MAX);
    prediction = sim.predict(state);
  } else if (setting === 'paused' && dir && state.status === 'flying') {
    // @spec COCKPIT-CTL-008 — pause-and-plan: shape a planned course; fuel is charged on resume.
    const base = plan ?? state;
    const dv = sim.PLAN_RATE * Math.min(Math.max(elapsed, 0), 0.25);
    const next = sim.planningBurn(base, dir, dv);
    if (next !== base) {
      plan = next;
      thrustedThisFrame = true;
      prediction = sim.predict(plan);
    }
  }

  scale += (targetScale() - scale) * 0.15;

  drawBackground();
  drawStarArrow();
  drawTrail();
  drawPrediction();
  drawPlanet();
  drawShip();
  drawSpeedArrows();
  drawDragHint();
  updateHud();
  updateMessage();

  requestAnimationFrame(frame);
}

resize();
reset();
requestAnimationFrame(frame);
