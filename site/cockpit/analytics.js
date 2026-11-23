// Analytics: forwards events to the shared Umami tracker, prefixed with this project's name.
// If the tracker is blocked, offline or not yet loaded, every call does nothing.
// @spec ANA-001, ANA-004
export const PREFIX = 'slingshot_';

export function track(event, data, w = globalThis.window) {
  try {
    w?.umami?.track(PREFIX + event, data);
  } catch {
    // A failing tracker must never affect the game.
  }
}
