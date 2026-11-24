// Level data: scenarios the flight sim runs. Pure data, no DOM.
// The layout was placed with scripts/design-level.mjs and is proven by tests/level.test.js.

import { PLANET_GM, PLANET_RADIUS, FUEL_DV } from './physics.js';

const world = (name, x, y, vx, vy) => ({ name, gm: PLANET_GM, radius: PLANET_RADIUS, drift: { x, y, vx, vy } });

// The ship starts as in the tutorial, relative to Home: 4 million km on its -x side, moving
// straight at it with 10 km/s of approach speed far away, plus Home's drift.
// @spec LEVEL-002
function startNextTo(home) {
  const approach = Math.sqrt(10 * 10 + (2 * home.gm) / 4.0e6);
  return {
    pos: { x: home.drift.x - 4.0e6, y: home.drift.y },
    vel: { x: home.drift.vx + approach, y: home.drift.vy },
  };
}

// @spec LEVEL-001
const HOME = world('Home', 0, 0, 0, 13);
export const LEVEL_1 = Object.freeze({
  name: 'level-1',
  worlds: [
    HOME,
    world('Racer', -9.776e6, 14.385e6, 14, 0),
    world('Haven', 3.344e6, 9.463e6, -7.023, 14.733),
  ],
  ship: startNextTo(HOME),
  fuel: FUEL_DV,
  predictSteps: 40000,
  end: { rule: 'level', destination: 2, catchRadius: 3.0e6, catchSpeed: 5, lostDistance: 3.0e7 },
});
