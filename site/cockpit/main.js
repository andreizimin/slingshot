// Cockpit: draws the flight sim and turns input into commands. Presentation only.
import * as sim from '../sim/physics.js';
import * as view from './view.js';
import { track } from './analytics.js';
import * as tours from './tour.js';
import { stageMarks } from './stage.js';
import { LEVEL_1 } from '../sim/levels.js';
import * as level from './level.js';

// Everywhere but production: a DEV badge, and a request to search engines not to index.
// @spec HOST-012
(function markStage() {
  const marks = stageMarks(window.location.hostname);
  const badge = document.getElementById('stage-badge');
  if (marks.badge && badge) {
    badge.textContent = marks.badge;
    badge.hidden = false;
  }
  if (marks.noindex) {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
  }
})();

const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const el = {
  speed: document.getElementById('speed'),
  change: document.getElementById('change'),
  fuel: document.getElementById('fuel-fill'),
  planned: document.getElementById('fuel-planned'),
  message: document.getElementById('message'),
  approach: document.getElementById('approach'),
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
const DRAG_DEADZONE = view.DRAG_DEADZONE;
let feedbackOpen = false; // while the feedback form is open, game input is ignored
let tour = null;          // getting-started tour state (see tour.js), null when not touring
let door = true;          // the start screen is up (TOUR-015); every load opens on it
let scenario = sim.TUTORIAL; // the tutorial while touring, the level otherwise
let focus = 0;            // the focus world the frame is drawn in (see sim.focusWorld)
let camX = 0;             // camera centre relative to the focus world, km (0,0 = focus-centred)
let camY = 0;
const CLOSE_UP_SCALE = 300; // km per px for the tour's opening close-up on the ship
let prevStatus = 'flying';
const COARSE = window.matchMedia('(pointer: coarse)').matches;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let W = 0;
let H = 0;
const stars = Array.from({ length: 140 }, (_, i) => {
  const r = (n) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return { x: r(1), y: r(2), s: 0.6 + r(3) * 1.1 };
});

// @spec COCKPIT-CTL-005, COCKPIT-CTL-007, COCKPIT-TRAIL-002, COCKPIT-CAM-003
// @spec LEVEL-009
function reset() {
  state = sim.initialState(scenario);
  focus = sim.focusWorld(state);
  plan = null;
  trail = [];
  prediction = sim.predict(state);
  setting = 'paused';
  ready = true;
  carry = 0;
  prevStatus = state.status;
  scale = targetScale();
  [camX, camY] = targetCamera();
  updateButtons();
}

const inLevel = () => scenario.end.rule === 'level';

// A position at sim time t, relative to the focus world at that same time.
// @spec COCKPIT-CAM-001
function rel(x, y, t) {
  const w = sim.worldPosition(scenario, focus, t);
  return { x: x - w.x, y: y - w.y };
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
  const step = tours.current(tour);
  if (step?.zoom === 'close') return CLOSE_UP_SCALE;
  return view.targetScale(shipRel(), W, H, playBottom());
}

// Where the camera wants to look: the ship during the tour's close-up, otherwise the planet.
// @spec TOUR-007
function targetCamera() {
  const step = tours.current(tour);
  if (step?.focus === 'ship') {
    const r = shipRel();
    return [r.x, r.y];
  }
  return [0, 0];
}

function shipRel() {
  return rel(state.pos.x, state.pos.y, state.t);
}

// The bottom of the play area: the card strip's top while a tour card shows, else the canvas bottom.
// @spec COCKPIT-CAM-007
function playBottom() {
  if (!tourEl.card.hidden && tourEl.card.offsetHeight) return Math.max(200, tourEl.card.getBoundingClientRect().top);
  return H;
}

// @spec COCKPIT-CAM-001, COCKPIT-CAM-007
function toScreen(rx, ry) {
  const [ox, oy] = view.playCentre(W, H, playBottom());
  return [ox + (rx - camX) / scale, oy - (ry - camY) / scale];
}

// The planet's centre on screen (the screen centre unless the camera is looking elsewhere).
function planetScreen() {
  return toScreen(0, 0);
}

// ---------- input ----------

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

function setSetting(next) {
  // @spec TOUR-006 — during the tour, play starts only once the tour gets to "Fly!".
  if (next !== 'paused' && !tours.inputAllowed(tours.current(tour), 'time')) return;
  if (door && next !== 'paused') return; // @spec TOUR-015 — no play from the start screen
  if (next === 'paused') {
    if (setting !== 'paused') resumeTo = setting;
    // @spec COCKPIT-PRED-004 — the prediction is computed when pausing, not while running.
    if (setting !== 'paused') prediction = sim.predict(plan ?? state);
    setting = 'paused';
  } else {
    // @spec COCKPIT-CTL-011 — resuming commits the planned course and charges its fuel.
    if (plan) { state = plan; plan = null; }
    // @spec TOUR-014 — remember which side the tutorial flight takes, for the checkpoint's words.
    if (tours.current(tour)?.id === 'fly') tour = { ...tour, side: tours.sideOf(state.planDv) };
    // @spec ANA-002, LEVEL-012 — a flight is launched when play starts from the ready state.
    if (ready) {
      const ev = inLevel() ? level.launchEvent() : view.launchEvent(state.planDv);
      track(ev.name, ev.data);
    }
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
  if (feedbackOpen) return; // @spec FEED-002 — typing in the feedback form never steers the ship
  // @spec TOUR-015 — on the start screen only Enter acts, choosing Tutorial.
  if (door) {
    if (ARROWS[e.key] || e.key === ' ' || e.key === 'Enter') e.preventDefault();
    if (!e.repeat && tours.doorKey(e.key)) chooseDoor(tours.doorKey(e.key));
    return;
  }
  const step = tours.current(tour);
  // @spec TOUR-012 — → and ← step through the tour (they never steer: only ↑ ↓ do).
  if (step && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault();
    if (e.repeat) return;
    if (e.key === 'ArrowRight') pressTourButton();
    else if (tours.canGoBack(tour) && !tourEl.card.hidden) tour = tours.prev(tour);
    return;
  }
  const dir = ARROWS[e.key];
  if (dir) {
    e.preventDefault();
    if (!held.includes(dir)) held.push(dir);
    return;
  }
  // @spec TOUR-006 — Enter presses the tour card's button; Space does too on Next steps.
  if (step && (e.key === 'Enter' || (e.key === ' ' && step.advance === 'tap'))) {
    e.preventDefault();
    if (!e.repeat) pressTourButton();
    return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    if (!e.repeat) togglePause();
  } else if (e.key === '1') setSetting('paused');
  else if (e.key === '2') setSetting('slow');
  else if (e.key === '3') setSetting('normal');
  else if (e.key === '4') setSetting('fast');
  else if (e.key === 'r' || e.key === 'R') resetKey();
});

window.addEventListener('keyup', (e) => {
  const dir = ARROWS[e.key];
  if (!dir) return;
  const i = held.indexOf(dir);
  if (i >= 0) held.splice(i, 1);
});

window.addEventListener('blur', () => { held.length = 0; drag = null; });

// @spec FEED-002 — the shared feedback widget announces when its form opens and closes.
window.addEventListener('feedback:open', () => { feedbackOpen = true; held.length = 0; drag = null; });
window.addEventListener('feedback:close', () => { feedbackOpen = false; });

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
  return view.dragDirection(drag.x - drag.x0, drag.y - drag.y0);
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

// Star badge: an arrow-shaped bubble with a little star (sun-like) inside, on the screen edge
// along the planet→star line, pointing toward the star.
// @spec COCKPIT-DRAW-005
function drawStarArrow() {
  if (!scenario.starGM) return;
  const narrow = W < 600;
  const p = sim.worldPosition(scenario, focus, state.t);
  const a = Math.atan2(p.y, -p.x); // screen angle toward the star (world origin), y flipped
  const r = narrow ? 18 : 22;
  const { cx, cy } = view.sunBadgePosition(a, W, H, r, narrow);

  ctx.save();
  ctx.translate(cx, cy);
  // Bubble with a pointed tip toward the star.
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
  ctx.fillText('Star', cx, cy + r + 16);
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
  const [px, py] = planetScreen();
  const [dx, dy] = view.radialRemap(x - px, y - py, sim.PLANET_RADIUS / scale, planetDrawRadius() + 6);
  return [px + dx, py + dy];
}

// @spec COCKPIT-DRAW-006
function drawTrail() {
  if (trail.length < 2) return;
  ctx.strokeStyle = 'rgba(226, 232, 240, 0.45)';
  ctx.lineWidth = 3;
  ctx.setLineDash([]);
  ctx.beginPath();
  trail.forEach((p, i) => {
    const r = rel(p.x, p.y, p.t);
    const [x, y] = pathPoint(r.x, r.y);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  const r = shipRel();
  ctx.lineTo(...shipScreenPos(r));
  ctx.stroke();
}

// The prediction is a planning tool: shown only while paused.
// @spec COCKPIT-PRED-002
function drawPrediction(now = 0) {
  if (!view.showPrediction(setting)) return;
  if (!prediction || prediction.points.length === 0) return;
  // @spec COCKPIT-PRED-003 — dashes march along the path in the direction of travel, with a soft pulse.
  const t = REDUCED_MOTION ? 0 : now / 1000;
  ctx.strokeStyle = `rgba(34, 211, 238, ${REDUCED_MOTION ? 1 : 0.75 + 0.25 * Math.sin(t * 4)})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 9]);
  ctx.lineDashOffset = -(t * 38) % 19; // negative offset moves dashes forward along the drawn path
  ctx.beginPath();
  const r = shipRel();
  ctx.moveTo(...shipScreenPos(r));
  for (const p of prediction.points) {
    const r = rel(p.ship.x, p.ship.y, p.t);
    ctx.lineTo(...pathPoint(r.x, r.y));
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function planetDrawRadius() {
  return view.planetDrawRadius(sim.PLANET_RADIUS, scale);
}

// Every world at its current position; the focus world sits at the frame's origin.
// @spec COCKPIT-DRAW-002, COCKPIT-DRAW-005, COCKPIT-DRAW-011
function drawWorlds() {
  scenario.worlds.forEach((w, i) => {
    const p = sim.worldPosition(scenario, i, state.t);
    const r = rel(p.x, p.y, state.t);
    const [cx, cy] = toScreen(r.x, r.y);
    const v = sim.worldVelocity(scenario, i, state.t);
    drawPlanet(cx, cy, Math.atan2(-v.y, v.x), i === focus, inLevel() ? w.name : null);
  });
}

function drawPlanet(cx, cy, heading, isFocus, name) {
  const R = planetDrawRadius();
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

  // World-motion cue along its velocity in the scenario's frame.
  const ux = Math.cos(heading), uy = Math.sin(heading);
  arrow(cx + ux * (R + 10), cy + uy * (R + 10), cx + ux * (R + 62), cy + uy * (R + 62), '#fbbf24', 3);
  if (isFocus) {
    ctx.fillStyle = '#fcd34d';
    ctx.font = '700 15px Nunito, system-ui, sans-serif';
    const lx = cx + ux * (R + 54) + 18, ly = cy + uy * (R + 54);
    ctx.fillText('planet moving', lx, ly);
    ctx.fillText('this way', lx, ly + 18);
  }
  if (name) pill(name, cx, cy + R + 22, '#f3d3a6', 'center');
}

// The destination's catch ring, and an edge arrow to it while it is off screen.
// @spec COCKPIT-DRAW-012
function drawDestinationMarker(now) {
  if (!inLevel()) return;
  const d = scenario.end.destination;
  const p = sim.worldPosition(scenario, d, state.t);
  const r = rel(p.x, p.y, state.t);
  const [cx, cy] = toScreen(r.x, r.y);
  const pulse = REDUCED_MOTION ? 1 : 0.5 + 0.5 * Math.sin(now / 400);
  ctx.save();
  ctx.strokeStyle = `rgba(167, 243, 208, ${0.35 + 0.35 * pulse})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(cx, cy, view.catchRingRadius(scenario.end.catchRadius, scale), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // Keep the edge arrow inside a box clear of the HUD bands (top 170 px, bottom 110 px).
  const side = W < 600 ? 40 : 60, top = 190, bottom = 130;
  if (cx >= 0 && cx <= W && cy >= 0 && cy <= H) return;
  const ox = W / 2, oy = (top + H - bottom) / 2;
  const a = Math.atan2(cy - oy, cx - ox);
  const k = Math.min((W / 2 - side) / Math.abs(Math.cos(a) || 1e-9), ((H - bottom - top) / 2) / Math.abs(Math.sin(a) || 1e-9));
  const ex = ox + Math.cos(a) * k, ey = oy + Math.sin(a) * k;
  arrow(ex - Math.cos(a) * 34, ey - Math.sin(a) * 34, ex, ey, 'rgba(167, 243, 208, 0.95)', 3);
  const dist = Math.hypot(state.pos.x - p.x, state.pos.y - p.y);
  const align = Math.cos(a) > 0.3 ? 'right' : Math.cos(a) < -0.3 ? 'left' : 'center';
  pill(view.destinationLabel(scenario.worlds[d].name, dist), ex - Math.cos(a) * 44, ey - Math.sin(a) * 44 + (Math.sin(a) > 0 ? -16 : 16), '#a7f3d0', align);
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
  const r = shipRel();
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
  const rel = shipRel();
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
  } else if (tours.current(tour)?.ring === 'arrows') {
    // The tour explains the sideways arrow before there is any sideways speed: show where it lives.
    arrow(x, y - SHIP_CLEAR_PX * 0.6, x, y - SIDE_MIN_PX, 'rgba(251, 146, 60, 0.6)', 4);
    pill('0.0 km/s sideways: yours to change', x, y - SIDE_MIN_PX - 18, '#fdba74', 'center');
  }
}

// Speed tuner: three sliders for steps per real second, applied live.
// @spec COCKPIT-TUNE-001
(function speedTuner() {
  const panel = document.getElementById('tuner');
  const toggle = document.getElementById('tuner-toggle');
  if (!view.tunerEnabled(window.location.search)) return; // hidden unless ?tune
  toggle.hidden = false;
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

// @spec COCKPIT-HUD-001, COCKPIT-HUD-002, COCKPIT-HUD-003, COCKPIT-HUD-006, COCKPIT-HUD-007
function updateHud() {
  el.speed.textContent = sim.starFrameSpeed(state).toFixed(1);
  const ch = view.changeReadout(sim.speedChange(state));
  el.change.className = `change ${ch.tone}`;
  el.change.textContent = ch.text;
  const bar = view.fuelBar(state.fuel, (plan ?? state).planDv, scenario.fuel);
  el.fuel.style.width = `${(bar.solid * 100).toFixed(1)}%`;
  el.planned.style.width = `${(bar.striped * 100).toFixed(1)}%`;
  el.fuel.classList.toggle('low', bar.low);
  // @spec COCKPIT-HUD-008
  let a = null;
  if (inLevel() && state.status === 'flying') {
    const d = scenario.end.destination;
    const p = sim.worldPosition(scenario, d, state.t);
    a = view.approachReadout({
      inside: Math.hypot(state.pos.x - p.x, state.pos.y - p.y) < scenario.end.catchRadius,
      farSpeed: sim.farSpeed(state, d),
      catchSpeed: scenario.end.catchSpeed,
    });
  }
  el.approach.hidden = !a;
  if (a) { el.approach.textContent = a.text; el.approach.classList.toggle('ok', a.ok); }
}

// @spec COCKPIT-MSG-001, COCKPIT-MSG-002, COCKPIT-MSG-003
// @spec COCKPIT-MSG-004, LEVEL-007, LEVEL-008
function updateMessage() {
  if (inLevel()) {
    const card = state.status === 'flying' ? (ready ? level.READY_CARD : null) : level.resultCard(state, scenario);
    const html = card ? card.html + (card.button ? `<br><button type="button" id="message-button">${card.button}</button>` : '') : null;
    showMessage(html);
    return;
  }
  const msg = view.messageFor({
    status: state.status,
    ready,
    coarse: COARSE,
    change: sim.speedChange(state),
    fuelFraction: state.fuel / sim.FUEL_DV,
  });
  // While touring, or on the start screen, the card does the talking.
  showMessage(msg && !tour && !door ? msg.html : null);
}

function showMessage(html) {
  if (html === null) {
    el.message.hidden = true;
  } else {
    if (el.message.dataset.html !== html) { el.message.innerHTML = html; el.message.dataset.html = html; }
    el.message.hidden = false;
  }
}

// @spec LEVEL-009 — the result card's button restarts the level.
el.message.addEventListener('click', (e) => {
  if (e.target.id === 'message-button') { reset(); e.target.blur(); }
});

// ---------- getting-started tour ----------

const tourEl = {
  card: document.getElementById('tour-card'),
  count: document.getElementById('tour-count'),
  title: document.getElementById('tour-title'),
  text: document.getElementById('tour-text'),
  button: document.getElementById('tour-next'),
  skip: document.getElementById('tour-skip'),
  back: document.getElementById('tour-back'),
  alt: document.getElementById('tour-alt'),
  replay: document.getElementById('tour-replay'),
  door: document.getElementById('door'),
  doorTitle: document.getElementById('door-title'),
  doorText: document.getElementById('door-text'),
  doorTutorial: document.getElementById('door-tutorial'),
  doorMission: document.getElementById('door-mission'),
};
const HUD_TARGETS = ['hud-speed', 'hud-fuel', 'hud-time'];

// The start screen: Tutorial or Sample mission.
// @spec TOUR-015, ANA-008
function showDoor() {
  door = true;
  tourEl.doorTitle.textContent = tours.DOOR.title;
  tourEl.doorText.textContent = tours.DOOR.text;
  tourEl.doorTutorial.textContent = tours.DOOR.choices[0].label;
  tourEl.doorMission.textContent = tours.DOOR.choices[1].label;
  tourEl.door.hidden = false;
}
function chooseDoor(choice) {
  door = false;
  tourEl.door.hidden = true;
  const ev = view.choiceEvent(choice);
  track(ev.name, ev.data);
  // @spec LEVEL-010 — Sample mission goes straight to the level.
  if (choice === 'mission') { scenario = LEVEL_1; reset(); }
  else startTour(true);
}
tourEl.doorTutorial.addEventListener('click', () => chooseDoor('tutorial'));
tourEl.doorMission.addEventListener('click', () => chooseDoor('mission'));

// @spec TOUR-002
function startTour(auto) {
  door = false;
  tourEl.door.hidden = true;
  scenario = sim.TUTORIAL;
  reset();
  tour = tours.start();
  track('tour_start', { auto: auto ? 1 : 0 });
}

function endTour(how) {
  const step = tours.current(tour);
  tour = null;
  if (how === 'skip') track('tour_skip', { step: step ? tours.stepIndex(step.id) + 1 : 0 });
  else track('tour_complete', { change: Math.round(sim.speedChange(state) * 10) / 10 });
  // @spec TOUR-013, LEVEL-010 — leaving the tutorial (I'm ready, or Skip) starts the level.
  scenario = LEVEL_1;
  reset();
  for (const id of HUD_TARGETS) document.getElementById(id)?.classList.remove('tour-target');
  tourEl.card.hidden = true;
}

function tourContext() {
  return {
    planDv: (plan ?? state).planDv,
    predictionEnding: prediction?.ending,
    setting,
    status: state.status,
    change: sim.speedChange(state),
  };
}

// @spec TOUR-003, TOUR-005
function pressTourButton() {
  const card = tours.cardFor(tour, tourContext());
  if (!card || !card.canAdvance || tourEl.card.hidden) return;
  if (card.action === 'retry') { retryTour(); return; }
  if (card.action === 'ready') { endTour('complete'); return; }
  if (card.action === 'resume') { tour = tours.next(tour); setSetting(resumeTo); return; }
  tour = tours.next(tour);
}

// R: a plain restart outside the tour; on the tour, "Try again" after a crash, finish after a
// departure, and nothing mid-flight or on the teaching steps.
// @spec TOUR-006
function resetKey() {
  const action = tours.resetAction(tours.current(tour), tourContext());
  if (action === 'restart') reset();
  else if (action === 'retry') retryTour();
  else if (action === 'ready') endTour('complete');
}

// Back to "Your turn" for another go: after a crash with a "too close" note, otherwise plainly.
// @spec TOUR-005
function retryTour() {
  const crashed = state.status === 'crashed';
  reset();
  tour = crashed ? tours.afterCrash() : { active: true, index: tours.stepIndex('try') };
}

tourEl.button.addEventListener('click', () => { pressTourButton(); tourEl.button.blur(); });
tourEl.skip.addEventListener('click', () => { endTour('skip'); tourEl.skip.blur(); });
tourEl.back.addEventListener('click', () => { tour = tours.prev(tour); tourEl.back.blur(); });
// @spec TOUR-014 — "Try the other side" flies the tutorial again from "Your turn".
tourEl.alt.addEventListener('click', () => {
  retryTour();
  tour = { ...tour, otherSide: true };
  tourEl.alt.blur();
});
// @spec TOUR-002 — the ? button replays the tour from the start.
tourEl.replay.addEventListener('click', () => { startTour(false); tourEl.replay.blur(); });

// @spec TOUR-004, TOUR-008
function updateTourCard() {
  const step = tours.current(tour);
  for (const id of HUD_TARGETS) {
    document.getElementById(id)?.classList.toggle('tour-target', !!step && step.target === id && tours.cardVisible(step, tourContext()));
  }
  if (!step) { tourEl.card.hidden = true; return; }
  const ctxNow = tourContext();
  const visible = tours.cardVisible(step, ctxNow);
  tourEl.card.hidden = !visible;
  if (!visible) return;
  const card = tours.cardFor(tour, ctxNow);
  tourEl.count.textContent = `${card.n} / ${card.of}`;
  tourEl.title.textContent = card.title;
  tourEl.text.textContent = card.text;
  tourEl.button.hidden = !card.button;
  if (card.button) tourEl.button.textContent = card.button;
  tourEl.button.disabled = !card.canAdvance;
  tourEl.back.hidden = !tours.canGoBack(tour);
  tourEl.alt.hidden = !card.secondary;
  if (card.secondary) tourEl.alt.textContent = card.secondary;
  placeCardInStrip();
}

// The card docks in the strip above the time buttons; it is never positioned by its target.
// @spec TOUR-016
function placeCardInStrip() {
  const timeTop = document.getElementById('hud-time').getBoundingClientRect().top || H - 84;
  const strip = tours.cardStrip(W, timeTop);
  tourEl.card.style.left = `${strip.left}px`;
  tourEl.card.style.width = `${strip.width}px`;
  tourEl.card.style.top = `${Math.max(8, strip.bottom - tourEl.card.offsetHeight)}px`;
}

// Pulsing ring around the highlighted world thing.
// @spec TOUR-008
function drawTourHighlight(now) {
  const step = tours.current(tour);
  if (!step || !tours.cardVisible(step, tourContext())) return;
  let x, y, r;
  const ringTarget = step.ring ?? step.target;
  if (ringTarget === 'planet') { [x, y] = planetScreen(); r = planetDrawRadius() + 16; }
  else if (ringTarget === 'ship' || ringTarget === 'arrows') {
    [x, y] = shipScreenPos(shipRel());
    r = ringTarget === 'arrows' ? 70 : 30;
  } else return;
  const pulse = REDUCED_MOTION ? 1 : 0.5 + 0.5 * Math.sin(now / 260);
  ctx.save();
  ctx.strokeStyle = `rgba(253, 224, 71, ${0.45 + 0.4 * pulse})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(x, y, r + 4 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// Story-only destination marker at the right edge, for the tour's opening steps.
// @spec TOUR-009
function drawDestination() {
  const step = tours.current(tour);
  if (!step?.destination) return;
  const x = W - 24;
  const y = H / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(167, 243, 208, 0.8)';
  ctx.setLineDash([5, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 130, y);
  ctx.lineTo(x - 10, y);
  ctx.stroke();
  ctx.setLineDash([]);
  arrow(x - 40, y, x - 4, y, 'rgba(167, 243, 208, 0.95)', 3);
  ctx.textAlign = 'right';
  pill('Destination: far away', x - 6, y - 22, '#a7f3d0', 'right');
  ctx.textAlign = 'left';
  ctx.restore();
}

// ---------- loop ----------

// @spec COCKPIT-LOOP-001, COCKPIT-TRAIL-001, COCKPIT-PRED-001
function frame(now) {
  const elapsed = lastTime === null ? 0 : (now - lastTime) / 1000;
  lastTime = now;

  const wanted = held.length ? held[held.length - 1] : dragDir();
  const dir = !door && tours.inputAllowed(tours.current(tour), 'push') ? wanted : null;
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
    // @spec COCKPIT-PRED-004 — no prediction is computed while running (pausing recomputes it).
    if (setting === 'paused') prediction = sim.predict(state);
    // @spec COCKPIT-CAM-006 — on a focus change, redraw in the new world's frame; the camera eases across.
    const nf = sim.focusWorld(state);
    if (nf !== focus) {
      const a = sim.worldPosition(scenario, focus, state.t), b = sim.worldPosition(scenario, nf, state.t);
      camX += a.x - b.x;
      camY += a.y - b.y;
      focus = nf;
    }
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

  // @spec ANA-003, LEVEL-012 — report how a flight ended, once, when the status changes.
  const ends = inLevel() ? level.endEvents(prevStatus, state, scenario) : view.flightEvents(prevStatus, state.status, {
    change: sim.speedChange(state),
    fuelFraction: state.fuel / sim.FUEL_DV,
  });
  for (const ev of ends) track(ev.name, ev.data);
  prevStatus = state.status;

  // @spec TOUR-003 — steps that move on by themselves (pressing play on "Fly!").
  const step = tours.current(tour);
  if (step && tours.autoAdvances(step) && tours.conditionMet(step, tourContext())) tour = tours.next(tour);
  // @spec TOUR-011 — mid-swing checkpoint: pause just after the closest point to the planet.
  if (step?.id === 'swing') {
    const rel = shipRel();
    if (state.status !== 'flying') {
      tour = { ...tour, index: tours.stepIndex('result') };
    } else if (tours.swingCheckpointDue(tour, { distance: Math.hypot(rel.x, rel.y), closest: state.closest })) {
      tour = { ...tour, swingShown: true };
      setSetting('paused');
    }
  }

  scale += (targetScale() - scale) * 0.15;
  const [cx, cy] = targetCamera();
  camX += (cx - camX) * 0.12;
  camY += (cy - camY) * 0.12;

  drawBackground();
  drawStarArrow();
  drawTrail();
  drawPrediction(now);
  drawDestinationMarker(now);
  drawWorlds();
  drawShip();
  drawSpeedArrows();
  drawDestination();
  drawTourHighlight(now);
  drawDragHint();
  updateHud();
  updateMessage();
  updateTourCard();

  requestAnimationFrame(frame);
}

resize();
// @spec TOUR-015 — every load opens on the start screen, over the paused tutorial scenario.
scenario = sim.TUTORIAL;
reset();
showDoor();
camX = targetCamera()[0];
camY = targetCamera()[1];
scale = targetScale();
requestAnimationFrame(frame);
