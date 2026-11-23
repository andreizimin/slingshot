// Cockpit: draws the flight sim and turns input into commands. Presentation only.
import * as sim from '../sim/physics.js';

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const el = {
  speed: document.getElementById('speed'),
  change: document.getElementById('change'),
  fuel: document.getElementById('fuel-fill'),
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

let W = 0;
let H = 0;
const stars = Array.from({ length: 140 }, (_, i) => {
  const r = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { x: r(1), y: r(2), s: 0.6 + r(3) * 1.1 };
});

// @spec COCKPIT-CTL-005, COCKPIT-CTL-007, COCKPIT-TRAIL-002, COCKPIT-CAM-003
function reset() {
  state = sim.initialState();
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
  const availX = Math.max(40, W / 2 - 40);
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
  } else if (e.key === '1') setSetting('slow');
  else if (e.key === '2') setSetting('normal');
  else if (e.key === '3') setSetting('fast');
  else if (e.key === 'r' || e.key === 'R') reset();
});

window.addEventListener('keyup', (e) => {
  const dir = ARROWS[e.key];
  if (!dir) return;
  const i = held.indexOf(dir);
  if (i >= 0) held.splice(i, 1);
});

window.addEventListener('blur', () => { held.length = 0; });
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

// @spec COCKPIT-DRAW-005
function drawStarArrow() {
  arrow(70, H / 2 - 20, 26, H / 2 - 20, '#94a3b8', 2.5);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '700 14px Nunito, system-ui, sans-serif';
  ctx.fillText('Sun', 28, H / 2 + 6);
}

// @spec COCKPIT-DRAW-006
function drawTrail() {
  if (trail.length < 2) return;
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  trail.forEach((p, i) => {
    const [x, y] = toScreen(p.x, p.y);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  const r = sim.planetRelativePosition(state);
  ctx.lineTo(...toScreen(r.x, r.y));
  ctx.stroke();
}

function drawPrediction() {
  if (!prediction || prediction.points.length === 0) return;
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 9]);
  ctx.beginPath();
  const r = sim.planetRelativePosition(state);
  ctx.moveTo(...toScreen(r.x, r.y));
  for (const p of prediction.points) {
    ctx.lineTo(...toScreen(p.ship.x - p.planet.x, p.ship.y - p.planet.y));
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
function drawShip() {
  const r = sim.planetRelativePosition(state);
  let [x, y] = toScreen(r.x, r.y);
  const R = planetDrawRadius();
  const dx = x - W / 2;
  const dy = y - H / 2;
  const dpx = Math.hypot(dx, dy);
  if (state.status === 'flying' && dpx < R + 8) {
    const k = (R + 8) / (dpx || 1);
    x = W / 2 + (dpx ? dx * k : -(R + 8));
    y = H / 2 + (dpx ? dy * k : 0);
  }
  const v = sim.planetFrameVelocity(state);
  const angle = Math.atan2(-v.y, v.x);

  if (thrustedThisFrame && thrustDirThisFrame) {
    const t = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[thrustDirThisFrame];
    // Flame on the side opposite the push.
    const fx = x - t[0] * 16;
    const fy = y - t[1] * 16;
    const fa = Math.atan2(-t[1], -t[0]);
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(fa);
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.moveTo(-4, -5);
    ctx.lineTo(10 + Math.random() * 4, 0);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
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

const fmt = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;

// @spec COCKPIT-HUD-001, COCKPIT-HUD-002, COCKPIT-HUD-003, COCKPIT-HUD-006
function updateHud() {
  el.speed.textContent = sim.starFrameSpeed(state).toFixed(1);
  const c = sim.speedChange(state);
  el.change.className = `change ${c > 0.05 ? 'up' : c < -0.05 ? 'down' : 'flat'}`;
  el.change.textContent = `${c < 0 ? '▼' : '▲'} ${fmt(c)}`;
  const f = state.fuel / sim.FUEL_DV;
  el.fuel.style.width = `${(f * 100).toFixed(1)}%`;
  el.fuel.classList.toggle('low', f < 0.2);
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
    html = 'Push up or down to pick a side, then press Space to go.';
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

  const dir = held.length ? held[held.length - 1] : null;
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
  } else if (setting === 'paused' && dir && state.status === 'flying' && state.fuel > 0) {
    // @spec COCKPIT-CTL-008 — pause-and-plan: instant burn, time frozen.
    const dv = (sim.FUEL_DV / 3) * Math.min(Math.max(elapsed, 0), 0.25);
    const next = sim.planningBurn(state, dir, dv);
    if (next !== state) {
      state = next;
      thrustedThisFrame = true;
      prediction = sim.predict(state);
    }
  }

  scale += (targetScale() - scale) * 0.15;

  drawBackground();
  drawStarArrow();
  drawTrail();
  drawPrediction();
  drawPlanet();
  drawShip();
  updateHud();
  updateMessage();

  requestAnimationFrame(frame);
}

resize();
reset();
requestAnimationFrame(frame);
