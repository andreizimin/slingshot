// Level rules for the cockpit: stars, the result card and the level's analytics events.
// Pure: no DOM, so they run under node --test.

const EPS = 1e-9;

// @spec LEVEL-003
export function starsFor(status, fuelLeft) {
  if (status !== 'arrived') return 0;
  if (fuelLeft >= 6 - EPS) return 3;
  if (fuelLeft >= 3 - EPS) return 2;
  return 1;
}

const percent = (fuel, budget) => Math.round((fuel / budget) * 100);
const starLine = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// @spec LEVEL-007
export const READY_CARD = {
  html: '<span class="big">Fly to Haven</span>You can\'t get there on fuel alone: chain slingshots, and arrive slowly enough to be caught.',
};

// The card shown when a level flight ends, or null while it is still flying.
// @spec LEVEL-008
export function resultCard(state, scenario) {
  if (state.status === 'arrived') {
    const n = starsFor('arrived', state.fuel);
    return {
      html: `<span class="big up">${starLine(n)}</span>You made it to ${scenario.worlds[scenario.end.destination].name}! Fuel left: ${percent(state.fuel, scenario.fuel)}%`,
      button: 'Fly again',
    };
  }
  if (state.status === 'crashed') {
    const name = scenario.worlds[state.crashedInto ?? 0]?.name ?? 'a world';
    return { html: `<span class="big">Bonk!</span>You hit ${name}.`, button: 'Try again' };
  }
  if (state.status === 'lost') {
    return { html: '<span class="big">Lost in space</span>You drifted too far from every world.', button: 'Try again' };
  }
  return null;
}

// @spec LEVEL-012
export const launchEvent = () => ({ name: 'level_start', data: {} });

// The end event, once: only on the frame the status leaves 'flying'.
// @spec LEVEL-012
export function endEvents(prevStatus, state, scenario) {
  if (prevStatus !== 'flying' || state.status === 'flying') return [];
  return [{
    name: 'level_end',
    data: { outcome: state.status, fuel_left: percent(state.fuel, scenario.fuel), stars: starsFor(state.status, state.fuel) },
  }];
}
