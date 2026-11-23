// Cockpit view logic: pure functions with no DOM or canvas, so they run under node --test.
// main.js does the drawing and input wiring; everything it decides is computed here.

export const SCALE_MIN = 1000;   // km per CSS px, closest zoom
export const SCALE_MAX = 20000;  // km per CSS px, widest zoom
export const PLANET_MIN_PX = 24;
export const DRAG_DEADZONE = 24;

// Target camera scale: the ship-to-planet distance spans 35% of the smaller screen side,
// clamped, and never so zoomed-in that the ship leaves the area clear of the HUD.
// rel = ship position relative to the planet, in km (world axes, +y up).
// @spec COCKPIT-CAM-002, COCKPIT-CAM-005
export function targetScale(rel, W, H) {
  const d = Math.hypot(rel.x, rel.y);
  const m = Math.min(W, H) || 800;
  let s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, d / (0.35 * m)));
  const availUp = Math.max(40, H / 2 - 170);
  const availDown = Math.max(40, H / 2 - 110);
  const availX = Math.max(40, W / 2 - (W < 600 ? 60 : 110));
  s = Math.max(s, Math.abs(rel.x) / availX, rel.y > 0 ? rel.y / availUp : -rel.y / availDown);
  return s;
}

// Drawn planet radius in px: true size, but never smaller than PLANET_MIN_PX.
// @spec COCKPIT-DRAW-002
export function planetDrawRadius(planetRadiusKm, scale) {
  return Math.max(planetRadiusKm / scale, PLANET_MIN_PX);
}

// Smooth radial remap around the planet centre: a point at screen offset (dx, dy), distance d,
// is drawn at distance sqrt(d² + K²) on the same bearing, with K² = drawR² − trueR², so the true
// surface lands on drawR and far points barely move. Returns the remapped offset.
// @spec COCKPIT-DRAW-010
export function radialRemap(dx, dy, trueR, drawR) {
  const K2 = Math.max(0, drawR * drawR - trueR * trueR);
  const d = Math.hypot(dx, dy);
  if (d === 0 || K2 === 0) return [dx, dy];
  const k = Math.sqrt(d * d + K2) / d;
  return [dx * k, dy * k];
}

// Push direction from a drag: only the vertical part counts (sideways steering only).
// dy is screen pixels, positive = down.
// @spec COCKPIT-CTL-009
export function dragDirection(dx, dy, deadzone = DRAG_DEADZONE) {
  if (Math.abs(dy) <= deadzone) return null;
  return dy < 0 ? 'up' : 'down';
}

// Fuel bar fractions: solid = fuel left after any queued plan; striped = fuel held now.
// @spec COCKPIT-HUD-003, COCKPIT-HUD-007
export function fuelBar(fuel, queued, fuelBudget) {
  const now = fuel / fuelBudget;
  const after = Math.max(0, fuel - Math.abs(queued)) / fuelBudget;
  return { solid: after, striped: now, low: after < 0.2 };
}

export const signed = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;

// Speed-change readout under the big number.
// @spec COCKPIT-HUD-002
export function changeReadout(change) {
  const tone = change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'flat';
  return { tone, text: `${change < 0 ? '▼' : '▲'} ${signed(change)}` };
}

// Centred message for the current situation, or null for none.
// @spec COCKPIT-MSG-001, COCKPIT-MSG-002, COCKPIT-MSG-003, COCKPIT-MOB-002
export function messageFor({ status, ready, coarse, change, fuelFraction }) {
  if (status === 'crashed') {
    return { kind: 'crash', html: '<span class="big">Bonk!</span>You hit the planet. Press R to try again.' };
  }
  if (status === 'departed') {
    const fuel = Math.round(fuelFraction * 100);
    const head = change > 0.05
      ? `<span class="big up">Boost! ${signed(change)} km/s</span>`
      : change < -0.05
        ? `<span class="big down">Brake! ${signed(change)} km/s</span>`
        : '<span class="big">No change</span>';
    return { kind: 'result', html: `${head}Fuel left: ${fuel}%<br>Press R to fly again.` };
  }
  if (ready) {
    return {
      kind: 'ready',
      html: coarse
        ? 'Drag up or down to pick a side, then tap Normal to go.'
        : 'Push up or down (arrows or drag) to pick a side, then press Space to go.',
    };
  }
  return null;
}

// Where the Star badge sits: on the screen edge along the ray from the planet (screen centre)
// toward the star, inset from the sides and kept between the top and bottom HUD bands.
// angle = screen angle toward the star (radians, screen y down).
// @spec COCKPIT-DRAW-005
export function sunBadgePosition(angle, W, H, r, narrow) {
  const inset = r * 1.9;
  const top = narrow ? 150 : 190;
  const bottom = H - (narrow ? 100 : 120);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const tx = ux < 0 ? (inset - W / 2) / ux : ux > 0 ? (W - inset - W / 2) / ux : Infinity;
  const ty = uy < 0 ? (top - H / 2) / uy : uy > 0 ? (bottom - H / 2) / uy : Infinity;
  const t = Math.min(tx, ty);
  return { cx: W / 2 + ux * t, cy: H / 2 + uy * t };
}

// The prediction line is a planning tool: drawn only while paused.
// @spec COCKPIT-PRED-002
export const showPrediction = (setting) => setting === 'paused';

// The speed tuner is a developer tool: shown only with ?tune in the URL.
// @spec COCKPIT-TUNE-001
export const tunerEnabled = (search) => new URLSearchParams(search).has('tune');

// Analytics event for starting a flight from the ready state (counts only).
// @spec ANA-002
export function launchEvent(planDv) {
  return { name: 'launch', data: { planned_dv: Math.round(Math.abs(planDv) * 10) / 10 } };
}

// Which analytics events a sim status change should send (counts only).
// @spec ANA-002, ANA-003
export function flightEvents(prevStatus, status, { change, fuelFraction }) {
  if (prevStatus !== 'flying' || prevStatus === status) return [];
  if (status === 'crashed') return [{ name: 'crash', data: { fuel_left: Math.round(fuelFraction * 100) } }];
  if (status === 'departed') {
    return [{
      name: 'flyby_result',
      data: {
        outcome: change > 0.05 ? 'boost' : change < -0.05 ? 'brake' : 'none',
        change: Math.round(change * 10) / 10,
        fuel_left: Math.round(fuelFraction * 100),
      },
    }];
  }
  return [];
}
